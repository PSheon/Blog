"use client";

import { type RefObject, useEffect, useRef } from "react";

/** A ref that says whether the element is on screen, so off-screen instruments can stop working. */
export function useVisible(target: RefObject<Element | null>): RefObject<boolean> {
  const visible = useRef(true);
  useEffect(() => {
    if (!target.current) return;
    const io = new IntersectionObserver((entries, _observer, entry = entries[entries.length - 1]) => { visible.current = entry.isIntersecting; }, { rootMargin: "100px" });
    io.observe(target.current);
    return () => io.disconnect();
  }, [target]);
  return visible;
}
