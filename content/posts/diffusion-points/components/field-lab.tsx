"use client";

import { useEffect, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { ALPHA_BAR, DIMS, T } from "./diffusion";
import { useLabels } from "./labels";
import { SHAPES } from "./shapes";
import { field, useLab } from "./store";

const GRID = 23, SIZE = 460, SPAN = 1.5;
/** How thick a slice of the fruit is drawn behind the arrows. */
const SLICE = 0.06;

/**
 * Fig. 04: what the network has actually learned, drawn on a vertical slice through the first fruit. At every grid
 * point an arrow shows which way the model would push a point standing there, at the chosen noise level.
 */
export function FieldLab() {
  const t = useLabels();
  const { pair, steps, generation } = useLab();
  const [trainedFor, setTrainedFor] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [level, setLevel] = useState(60);
  // Redraw as training progresses, but not on every published step count.
  const stage = Math.floor(steps / 250);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    let cancelled = false;
    // The real fruit's average colour, for the query points (see below).
    const shape = SHAPES[pair[0]], mean = [0, 0, 0], outline: number[][] = [];
    let seed = 11;
    const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (let i = 0; i < 9000; i++) {
      const p = shape(rng);
      for (let k = 0; k < 3; k++) mean[k] += p[3 + k] / 9000;
      if (Math.abs(p[1]) <= SLICE) outline.push(p);
    }
    // Ask the model about a grid of points in the plane y = 0. A point at this noise level would carry a faded
    // version of the fruit's colour, so that is the colour the query points are given.
    const n = GRID * GRID, x = new Float32Array(n * DIMS), keep = Math.sqrt(ALPHA_BAR[level]);
    for (let i = 0; i < n; i++) {
      x[i * DIMS] = ((i % GRID) / (GRID - 1)) * 2 * SPAN - SPAN;
      x[i * DIMS + 2] = (Math.floor(i / GRID) / (GRID - 1)) * 2 * SPAN - SPAN;
      for (let k = 0; k < 3; k++) x[i * DIMS + 3 + k] = keep * mean[k];
    }
    void field(level, x).then(({ noise: eps, trainedFor: at }) => {
      if (cancelled) return;
      setTrainedFor(at);
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      ctx.canvas.width = ctx.canvas.height = SIZE * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, SIZE, SIZE);
      const px = (v: number) => SIZE / 2 + (v / SPAN) * (SIZE / 2), pz = (v: number) => SIZE / 2 - (v / SPAN) * (SIZE / 2);
      // The real fruit where this slice cuts it.
      ctx.globalAlpha = 0.55;
      for (const p of outline) {
        ctx.fillStyle = `rgb(${[3, 4, 5].map((k) => Math.round(((p[k] + 1) / 2) * 255)).join(",")})`;
        ctx.fillRect(px(p[0]) - 1, pz(p[2]) - 1, 2, 2);
      }
      ctx.globalAlpha = 1;
      // Lengths are relative to the longest arrow in this picture (square-rooted, so the short ones near the fruit
      // stay visible): what matters is the pattern, and the colour still tells long from short.
      let longest = 1e-6;
      for (let i = 0; i < n; i++) longest = Math.max(longest, Math.hypot(eps[i * DIMS], eps[i * DIMS + 2]));
      ctx.lineWidth = 1.3;
      ctx.lineCap = "round";
      for (let i = 0; i < n; i++) {
        // Removing noise moves a point along −ε.
        const dx = -eps[i * DIMS], dz = -eps[i * DIMS + 2], size = Math.hypot(dx, dz), len = Math.sqrt(size / longest) * (SIZE / GRID) * 0.95;
        if (size < 1e-6) continue;
        const x0 = px(x[i * DIMS]), z0 = pz(x[i * DIMS + 2]), ux = dx / size, uz = -dz / size, x1 = x0 + ux * len, z1 = z0 + uz * len;
        ctx.strokeStyle = `hsl(${195 + 140 * (size / longest)} 90% 70%)`;
        ctx.beginPath();
        ctx.moveTo(x0, z0);
        ctx.lineTo(x1, z1);
        ctx.moveTo(x1, z1);
        ctx.lineTo(x1 - ux * 4 - uz * 2.5, z1 - uz * 4 + ux * 2.5);
        ctx.moveTo(x1, z1);
        ctx.lineTo(x1 - ux * 4 + uz * 2.5, z1 - uz * 4 - ux * 2.5);
        ctx.stroke();
      }
    });
    return () => { cancelled = true; };
  }, [pair, level, stage, generation]);

  return (
    <div className="grid gap-4 text-sm">
      <canvas ref={canvas} role="img" aria-label={t.fieldStage(t.fruit[pair[0]])} className="mx-auto aspect-square w-full max-w-[460px] rounded-md border border-border bg-[#070918]" data-testid="diffusion-field" />
      <label className="grid gap-2">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="label">{t.level}</span>
          <span className="font-mono tabular">{level} / {T}</span>
        </span>
        <Slider value={[level]} min={1} max={T} step={1} aria-label={t.level} onValueChange={(v) => setLevel(Array.isArray(v) ? v[0] : v)} />
      </label>
      <p className="text-muted-foreground">{trainedFor === 0 ? t.fieldUntrained : t.trainedFor(trainedFor)}</p>
    </div>
  );
}
