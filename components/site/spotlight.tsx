"use client";

import { useEffect } from "react";

/**
 * One listener for the whole page: whichever `.spotlight` element the pointer is over gets `--mx` / `--my`, and
 * globals.css paints a soft light there. Mouse and pen only; a finger has no hover to follow.
 */
export function Spotlight() {
  useEffect(() => {
    if (!window.matchMedia("(hover: hover)").matches) return;
    let pending = 0, last: PointerEvent | null = null;
    const apply = () => {
      pending = 0;
      const target = (last?.target as Element | null)?.closest?.(".spotlight") as HTMLElement | null;
      if (!target || !last) return;
      const box = target.getBoundingClientRect();
      target.style.setProperty("--mx", `${last.clientX - box.left}px`);
      target.style.setProperty("--my", `${last.clientY - box.top}px`);
    };
    const onMove = (event: PointerEvent) => { last = event; if (!pending) pending = requestAnimationFrame(apply); };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => { document.removeEventListener("pointermove", onMove); cancelAnimationFrame(pending); };
  }, []);
  return null;
}
