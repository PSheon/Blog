"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** A navigation that finishes sooner than this never shows the bar: most of them do. */
const SHOW_AFTER_MS = 150;

/**
 * A thin bar along the top while a navigation is in flight. The App Router has no navigation events, so a click
 * on an internal link starts it and a change of pathname ends it.
 */
export function NavProgress({ label }: { label: string }) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const timer = useRef(0);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, location.href);
      // Same page (or just a #fragment): nothing loads.
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    };
    // Capture phase: next/link calls preventDefault() on its own clicks, so by the bubble phase every internal
    // navigation already looks "handled".
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Arrived: whatever was pending is over.
  useEffect(() => {
    window.clearTimeout(timer.current);
    const id = window.setTimeout(() => setVisible(false), 0);
    return () => window.clearTimeout(id);
  }, [pathname]);

  if (!visible) return null;
  return (
    <div role="progressbar" aria-label={label} aria-busy className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden" data-testid="nav-progress">
      <div className="nav-progress-bar triad-gradient h-full w-full origin-left" />
    </div>
  );
}
