"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Registers /sw.js, or, with `enabled` false, removes a worker that an earlier deployment installed: the kill
 * switch. Rendered by the layout only on production (not on Vercel previews, whose URLs are throwaway origins).
 *
 * It also tells the worker what to keep for offline reading. The worker only sees requests made after it took control,
 * so on a first visit it has seen neither the document nor its scripts; and an article reached by a client-side
 * navigation was fetched as an RSC payload, never as the HTML a reload needs. Both are handed over here, when the
 * browser is idle. Scripts and styles come back out of the HTTP cache, so this costs one small document request.
 */
export function ServiceWorker({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  useEffect(() => {
    if (!enabled || !("serviceWorker" in navigator)) return undefined;
    let cancelled = false;
    const timers: number[] = [];
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 1500));
    const hand = (registration: ServiceWorkerRegistration) => {
      if (cancelled || !registration.active) return;
      const loaded = performance.getEntriesByType("resource").map((entry) => entry.name).filter((url) => url.startsWith(location.origin) && /\/_next\/static\/|\/icons\//.test(url));
      registration.active.postMessage({ type: "warm", urls: [location.pathname, ...new Set(loaded)] });
    };
    // Once when idle, then twice more. A chunk that was requested before the worker took control but arrived after
    // the first list (the home page's lazy classifier does this) is on neither side's books otherwise. The worker
    // skips what it already holds, so a repeat costs nothing.
    void navigator.serviceWorker.ready.then((registration) => {
      idle(() => hand(registration));
      for (const ms of [4000, 12000]) timers.push(window.setTimeout(() => hand(registration), ms));
    });
    return () => { cancelled = true; timers.forEach((id) => window.clearTimeout(id)); };
  }, [enabled, pathname]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    if (enabled) {
      // After load, so that registration never competes with the first paint.
      const register = () => void navigator.serviceWorker.register("/sw.js").catch((error) => console.warn("[sw] registration failed", error));
      if (document.readyState === "complete") register();
      else window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
    void navigator.serviceWorker.getRegistrations().then((all) => all.forEach((r) => void r.unregister()));
    if ("caches" in window) void caches.keys().then((keys) => keys.forEach((key) => void caches.delete(key)));
    return undefined;
  }, [enabled]);
  return null;
}
