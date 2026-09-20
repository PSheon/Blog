"use client";

import { type RefObject, useEffect, useState } from "react";

/**
 * False until the element first comes within `margin` of the viewport, then true for good. For set-up that costs
 * real time (rasterising a data set, building a model, scoring it): done on mount it lands in the page's first
 * second, in front of a reader who is still at the headline. Started a screen early, it is ready on arrival.
 */
export function useNear(target: RefObject<Element | null>, margin = "800px"): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = target.current;
    if (!el || near) return;
    const io = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && setNear(true), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [target, near, margin]);
  return near;
}
