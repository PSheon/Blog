/*
 * paul.notebook service worker. Hand-written, no build step, no dependencies.
 *
 *  - Pages (HTML and Next's RSC payloads): network first, the cached copy only when the network fails. A reader
 *    who is online never sees a stale article.
 *  - Immutable build assets, the Lite3 simulator files and fonts: cache first. They are content-hashed or
 *    versioned by query string, so a cached copy is always the right one.
 *  - Nothing is precached except the offline page. The 4.5 MB simulator is cached only once a reader has asked
 *    for it.
 *  - A page can ask for URLs to be kept ("warm"). The first visit needs it: the document and its scripts load before
 *    this worker exists, so they never pass through `fetch` below. So does an article reached by a client-side
 *    navigation, which only ever fetched its RSC payload, not the HTML a reload would need.
 *  - Offline, "/" (the installed app's start URL) is a redirect by language and can never be cached, so it is
 *    answered with the cached home page instead.
 *
 * To retire this worker: deploy with NEXT_PUBLIC_SERVICE_WORKER=off. The page then unregisters it and empties
 * its caches (components/site/service-worker.tsx). Bump VERSION to drop every cache on the next visit.
 */
const VERSION = "v1";
const PAGES = `pages-${VERSION}`, ASSETS = `assets-${VERSION}`;
const OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((cache) => cache.add(OFFLINE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== PAGES && key !== ASSETS).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

const isAsset = (url) => url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/lite3/") || url.pathname.startsWith("/icons/");

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS), hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

/** Keep the page cache from growing for ever: every `?_rsc=` variant of every prefetched link lands in it. */
const MAX_PAGES = 150;
async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_PAGES) return;
  // Oldest first is insertion order. The offline page is re-added on every install, so losing it is not possible here.
  await Promise.all(keys.filter((key) => !key.url.endsWith(OFFLINE)).slice(0, keys.length - MAX_PAGES + 30).map((key) => cache.delete(key)));
}

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone()).then(() => trim(cache));
    return response;
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) return hit;
    if (request.mode === "navigate") {
      const path = new URL(request.url).pathname;
      if (path === "/") {
        const home = (await cache.match(navigator.language?.startsWith("zh") ? "/zh" : "/en")) ?? (await cache.match("/zh")) ?? (await cache.match("/en"));
        if (home) return home;
      }
      return (await cache.match(OFFLINE)) ?? Response.error();
    }
    throw error;
  }
}

/** Put URLs the page names into the right cache, unless they are there already. Failures are not worth reporting. */
async function warm(urls) {
  const pages = await caches.open(PAGES), assets = await caches.open(ASSETS);
  await Promise.all(urls.map(async (raw) => {
    try {
      const url = new URL(raw, self.location.origin);
      if (url.origin !== self.location.origin || url.pathname.startsWith("/_vercel/")) return;
      url.hash = "";
      const cache = isAsset(url) ? assets : pages;
      if (await cache.match(url.href)) return;
      const response = await fetch(url.href, { credentials: "same-origin" });
      if (response.ok && !response.redirected) await cache.put(url.href, response);
    } catch { /* offline, or gone: nothing to keep */ }
  }));
  await trim(pages);
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "warm" && Array.isArray(event.data.urls)) event.waitUntil(warm(event.data.urls.slice(0, 200)));
});

self.addEventListener("fetch", (event) => {
  const { request } = event, url = new URL(request.url);
  // Only our own GETs. Vercel's analytics endpoints and anything cross-origin go straight to the network.
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/_vercel/")) return;
  // A worker's own script goes straight to the network, never through a cache. The bundler hands a worker its chunk
  // list in the URL's fragment (`…/turbopack-worker-…js#params=…`), and a fragment is not part of a Request: answering
  // one from here loses it, and every worker on the site dies with "Missing worker bootstrap config".
  if (request.destination === "worker" || request.destination === "sharedworker") return;
  event.respondWith(isAsset(url) ? cacheFirst(request) : networkFirst(request));
});
