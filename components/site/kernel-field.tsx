"use client";

import { runWhenSeen } from "@/components/lab/run-when-seen";
import { useEffect, useRef } from "react";

const CELL = 7, GAP = 4, PITCH = CELL + GAP;

/**
 * The site's 3×3 mark, continued into a field: small squares whose brightness drifts at random, like activations
 * in a feature map. Drawn on one canvas, only while on screen; still (but present) with reduced motion.
 */
export function KernelField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0, cols = 0, rows = 0, levels = new Float32Array(0), last = 0, colour = "#79dafa";

    const resize = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1), w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      cols = Math.ceil(w / PITCH); rows = Math.ceil(h / PITCH);
      levels = Float32Array.from({ length: cols * rows }, () => Math.random() ** 3);
      colour = getComputedStyle(canvas).color;
      draw();
    };
    const draw = () => {
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      ctx.fillStyle = colour;
      for (let i = 0; i < levels.length; i++) {
        ctx.globalAlpha = 0.06 + levels[i] * 0.5;
        ctx.fillRect((i % cols) * PITCH, Math.floor(i / cols) * PITCH, CELL, CELL);
      }
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 90) return; // about 11 frames a second is plenty for a flicker
      last = now;
      for (let k = 0; k < levels.length / 14; k++) levels[Math.floor(Math.random() * levels.length)] = Math.random() ** 3;
      draw();
    };

    const sized = new ResizeObserver(resize), themed = new MutationObserver(resize);
    sized.observe(canvas);
    themed.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    // No frames at all while the footer is off screen, the tab is behind, or motion is unwanted (asked again whenever that changes).
    let unwatch = () => {};
    const watch = () => { unwatch(); unwatch = calm.matches ? () => {} : runWhenSeen(canvas, () => { raf = requestAnimationFrame(loop); }, () => cancelAnimationFrame(raf)); };
    watch(); calm.addEventListener("change", watch);
    return () => { unwatch(); calm.removeEventListener("change", watch); sized.disconnect(); themed.disconnect(); };
  }, []);

  return <canvas ref={ref} aria-hidden className={className} />;
}
