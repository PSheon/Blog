"use client";

import { useMemo, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { ALPHA_BAR, DIMS, T, gaussian } from "./diffusion";
import { useLabels } from "./labels";
import { SHAPES } from "./shapes";
import { useLab } from "./store";
import { useCloud } from "./use-cloud";

const POINTS = 2500;
const EXTENT: [number, number] = [1.6, 1.3];

/** Fig. 02: the forward process. No network here: a fruit and a slider that buries it in noise. */
export function NoiseLab() {
  const t = useLabels();
  const { pair } = useLab();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [level, setLevel] = useState(0);
  // The same fruit points and the same noise for every slider position, so dragging back un-buries the same fruit.
  const { clean, noise } = useMemo(() => {
    const clean = new Float64Array(POINTS * DIMS), noise = Float64Array.from({ length: POINTS * DIMS }, () => gaussian(Math.random));
    for (let i = 0; i < POINTS; i++) clean.set(SHAPES[pair[0]](Math.random), i * DIMS);
    return { clean, noise };
  }, [pair]);
  const shown = useRef(new Float64Array(POINTS * DIMS));

  useCloud(canvas, POINTS, EXTENT, (view) => {
    const keep = Math.sqrt(ALPHA_BAR[level]), add = Math.sqrt(1 - ALPHA_BAR[level]);
    for (let i = 0; i < shown.current.length; i++) shown.current[i] = keep * clean[i] + add * noise[i];
    view.set(shown.current);
  });

  return (
    <div className="grid gap-4 text-sm">
      <canvas ref={canvas} role="img" aria-label={t.noiseStage} className="aspect-[4/3] w-full rounded-md border border-border bg-[#070918] sm:aspect-[2/1]" />
      <label className="grid gap-2">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="label">{t.level}</span>
          <span className="font-mono tabular" data-testid="diffusion-level">{t.levelValue(level, T, Math.round(Math.sqrt(ALPHA_BAR[level]) * 100))}</span>
        </span>
        <Slider value={[level]} min={0} max={T} step={1} aria-label={t.level} onValueChange={(v) => setLevel(Array.isArray(v) ? v[0] : v)} />
      </label>
    </div>
  );
}
