"use client";

import { type RefObject, useEffect, useRef } from "react";
import { useReducedMotion } from "@/components/lab/use-reduced-motion";
import { CloudView } from "./cloud-view";

/**
 * Runs `frame` once per animation frame while the canvas is on screen, with a ready CloudView.
 * The cloud turns slowly unless the reader prefers reduced motion.
 */
export function useCloud(canvas: RefObject<HTMLCanvasElement | null>, count: number, extent: [number, number], frame: (view: CloudView, dt: number) => void, narrowExtent?: [number, number], onVisible?: (visible: boolean) => void) {
  const still = useReducedMotion();
  const latest = useRef({ frame, onVisible });
  useEffect(() => { latest.current = { frame, onVisible }; });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let raf = 0, disposed = false, visible = true, view: CloudView | null = null, prev = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      if (!visible || !view) return;
      if (!still) view.angle += dt * 0.4;
      latest.current.frame(view, dt);
      view.render();
    };
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      latest.current.onVisible?.(visible);
    });
    seen.observe(el);
    void CloudView.create(el, count, extent, narrowExtent).then((v) => {
      if (disposed) return v.dispose();
      view = v;
      raf = requestAnimationFrame(loop);
    });
    return () => { disposed = true; cancelAnimationFrame(raf); seen.disconnect(); latest.current.onVisible?.(false); view?.dispose(); };
  }, [canvas, count, extent, narrowExtent, still]);
}
