"use client";

import { type RefObject, useEffect, useRef } from "react";

/**
 * Calls `refresh` when `target` scrolls into view and what it shows is older than the model (`modelSteps` differs
 * from `shownSteps`), and again whenever the model changes while it is in view but not training. So an instrument
 * further down never shows a run from before the reader pressed Train.
 */
const FOLLOW_EVERY_MS = 6000;

export function useFresh(target: RefObject<Element | null>, modelSteps: number, shownSteps: number, busy: boolean, training: boolean, refresh: () => void) {
  const visible = useRef(false), last = useRef(0);
  const latest = useRef({ modelSteps, shownSteps, busy, training, refresh });
  useEffect(() => { latest.current = { modelSteps, shownSteps, busy, training, refresh }; });

  useEffect(() => {
    const check = () => {
      const s = latest.current;
      // A refresh costs the worker about half a second that training does not get. While training is running the
      // model is always newer than what is shown, so follow it at a calm pace rather than continuously.
      if (!visible.current || s.busy || s.modelSteps === s.shownSteps) return;
      if (s.training && performance.now() - last.current < FOLLOW_EVERY_MS) return;
      last.current = performance.now();
      s.refresh();
    };
    const seen = new IntersectionObserver(([entry]) => { visible.current = entry.isIntersecting; check(); }, { threshold: 0.2 });
    if (target.current) seen.observe(target.current);
    const timer = window.setInterval(check, 1000);
    return () => { seen.disconnect(); window.clearInterval(timer); };
  }, [target]);
}
