"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { type Overlay, paintScene } from "./paint";

interface Props extends Overlay {
  image: ArrayLike<number> | null;
  /** Accessible name. Pass "" when a parent (e.g. a button) already names it: the canvas is then decorative. */
  label: string;
  className?: string;
}

export function SceneCanvas({ image, mask, boxes, label, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => paintScene(canvas, image, { mask, boxes });
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [image, mask, boxes, resolvedTheme]);

  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  return <canvas ref={ref} {...a11y} className={cn("block aspect-square w-full rounded-sm border border-border bg-background", className)} />;
}
