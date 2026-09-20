"use client";

import { type RefObject, useEffect, useState } from "react";

/**
 * Data that takes a few hundred milliseconds to compute (a replayed drive): prepared in slices, and only once the
 * figure is within a screen or so of the viewport, instead of during hydration. While `key` changes the previous
 * result stays, so a slider never blanks the figure; a newer request cancels the older one.
 */
export function useReplay<T>(near: RefObject<Element | null>, key: unknown, build: (cancelled: () => boolean) => Promise<T | null>): T | null {
  const [wanted, setWanted] = useState(false);
  const [value, setValue] = useState<T | null>(null);

  useEffect(() => {
    if (!near.current) return;
    const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setWanted(true); io.disconnect(); } }, { rootMargin: "1200px" });
    io.observe(near.current);
    return () => io.disconnect();
  }, [near]);

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    void build(() => cancelled).then((result) => { if (!cancelled && result !== null) setValue(result); });
    return () => { cancelled = true; };
    // `build` is rebuilt every render; `key` is what says the inputs changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, key]);

  return value;
}
