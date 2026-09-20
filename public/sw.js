/*
 * paul.notebook service worker. Hand-written, no build step, no dependencies.
 *
 *  - Pages (HTML and Next's RSC payloads): network first, the cached copy only when the network fails. A reader
 *    who is online never sees a stale article.
 *  - Immutable build assets, the Lite3 simulator files and fonts: cache first. They are content-hashed or
 *    versioned by query string, so a cached copy is always the right one.
 *  - Nothing is precached except the offline page. The 4.5 MB simulator is cached only once a reader has asked
 *    for it.
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

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) return hit;
    if (request.mode === "navigate") return (await cache.match(OFFLINE)) ?? Response.error();
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event, url = new URL(request.url);
  // Only our own GETs. Vercel's analytics endpoints and anything cross-origin go straight to the network.
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/_vercel/")) return;
  event.respondWith(isAsset(url) ? cacheFirst(request) : networkFirst(request));
});
