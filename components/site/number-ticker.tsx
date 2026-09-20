"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A readout that counts up to its value the first time it is seen, like an instrument settling. The server and
 * reduced motion both get the final number straight away, so nothing depends on the animation.
 */
export function NumberTicker({ value, pad = 0, duration = 900 }: { value: number; pad?: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const el = ref.current;
    if (!el || value === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0, start = 0;
    const tick = (now: number) => {
      start ||= now;
      const t = Math.min(1, (now - start) / duration), eased = 1 - (1 - t) ** 3;
      setShown(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    const seen = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      seen.disconnect();
      setShown(0);
      raf = requestAnimationFrame(tick);
    });
    seen.observe(el);
    return () => { seen.disconnect(); cancelAnimationFrame(raf); };
  }, [value, duration]);

  return <span ref={ref}>{String(shown).padStart(pad, "0")}</span>;
}
