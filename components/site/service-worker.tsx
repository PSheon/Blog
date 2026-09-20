"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js, or, with `enabled` false, removes a worker that an earlier deployment installed: the kill
 * switch. Rendered by the layout only on production (not on Vercel previews, whose URLs are throwaway origins).
 */
export function ServiceWorker({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (enabled) {
      // After load, so that registration never competes with the first paint.
      const register = () => void navigator.serviceWorker.register("/sw.js").catch((error) => console.warn("[sw] registration failed", error));
      if (document.readyState === "complete") register();
      else window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
    void navigator.serviceWorker.getRegistrations().then((all) => all.forEach((r) => void r.unregister()));
    if ("caches" in window) void caches.keys().then((keys) => keys.forEach((key) => void caches.delete(key)));
  }, [enabled]);
  return null;
}
