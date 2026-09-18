"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { drawHeatmap, type Rgb } from "./heatmap";

interface Props {
  data: ArrayLike<number> | null;
  w: number;
  h: number;
  mode?: "seq" | "div";
  max?: number;
  positive?: Rgb;
  label: string;
  className?: string;
}

/** A pixel-exact heatmap: one canvas pixel per value, scaled up without smoothing. */
export function HeatCanvas({ data, w, h, mode, max, positive, label, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (ref.current) drawHeatmap(ref.current, data ?? new Float32Array(w * h), w, h, { mode, max, positive });
  }, [data, w, h, mode, max, positive, resolvedTheme]);

  // An empty label means a parent already describes it: the canvas is then decorative.
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  return (
    <canvas
      ref={ref}
      {...a11y}
      className={cn("block aspect-square w-full border border-border [image-rendering:pixelated]", className)}
    />
  );
}
