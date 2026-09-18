"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { PEN_RADIUS, type Point, type Stroke } from "./strokes";

interface Props {
  strokes: Stroke[];
  onChange(strokes: Stroke[]): void;
  ariaLabel: string;
  hint?: string;
  className?: string;
}

/**
 * Drawing surface. It records strokes in unit coordinates and only *displays* them on
 * a canvas — the network's copy is rasterised separately in pure TS (see strokes.ts),
 * so device pixel ratio and canvas antialiasing never change the prediction.
 */
export function DigitCanvas({ strokes, onChange, ariaLabel, hint, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef<Stroke[] | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const paint = () => {
      const dpr = window.devicePixelRatio || 1;
      const side = canvas.clientWidth;
      if (canvas.width !== Math.round(side * dpr)) {
        canvas.width = canvas.height = Math.round(side * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const s = canvas.width;
      ctx.clearRect(0, 0, s, s);
      ctx.strokeStyle = ctx.fillStyle = getComputedStyle(canvas).getPropertyValue("--foreground");
      ctx.lineWidth = PEN_RADIUS * 2 * s;
      ctx.lineCap = ctx.lineJoin = "round";
      for (const stroke of live.current ?? strokes) {
        ctx.beginPath();
        stroke.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
        if (stroke.length === 1) ctx.lineTo(stroke[0][0] * s + 0.01, stroke[0][1] * s);
        ctx.stroke();
      }
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [strokes, resolvedTheme]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };

  const frame = useRef(0);
  const flush = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => live.current && onChange(live.current.map((s) => [...s])));
  };

  return (
    <div className={cn("relative", className)}>
      <canvas
        ref={ref}
        role="img"
        aria-label={ariaLabel}
        data-testid="digit-canvas"
        className="block aspect-square w-full cursor-crosshair touch-none rounded-sm border border-border bg-background"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          live.current = [...strokes.map((s) => [...s]), [point(e)]];
          flush();
        }}
        onPointerMove={(e) => {
          if (!live.current || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
          live.current[live.current.length - 1].push(point(e));
          flush();
        }}
        onPointerUp={() => {
          if (!live.current) return;
          const done = live.current;
          live.current = null;
          cancelAnimationFrame(frame.current);
          onChange(done);
        }}
        onPointerCancel={() => (live.current = null)}
      />
      {hint && strokes.length === 0 && (
        <p className="label pointer-events-none absolute inset-0 grid place-items-center text-center">{hint}</p>
      )}
    </div>
  );
}
