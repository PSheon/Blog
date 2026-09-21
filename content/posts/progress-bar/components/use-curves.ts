"use client";

import { type RefObject, useEffect, useState } from "react";
import { type Bar, BARS, type Honesty, type JobOptions, makeJob, PARAMS, trace } from "./sim";
import { useVisible } from "./use-visible";

export type Averaged = { curves: Record<Bar, Float64Array>; /** Mean distance from the truth at each moment, 0–1: averaging the curves themselves lets errors in opposite directions cancel. */ gaps: Record<Bar, Float64Array>; honesty: Record<Bar, Honesty>; total: number; done: number; of: number };

/**
 * The average curve of each bar over `runs` jobs, worked out in the page a few jobs at a time so that a frame is never
 * held up, and only once the figure is on screen. Changing a setting starts again.
 */
export function useCurves(root: RefObject<HTMLElement | null>, options: JobOptions, workers: number, bars: readonly Bar[], runs = 150): Averaged | null {
  const visible = useVisible(root), [result, setResult] = useState<Averaged | null>(null), key = JSON.stringify([options, workers, bars, runs]);
  useEffect(() => {
    let cancelled = false, seed = 1, timer = 0;
    const sums = Object.fromEntries(BARS.map((b) => [b, new Float64Array(PARAMS.samples + 1)])) as Record<Bar, Float64Array>;
    const gapSums = Object.fromEntries(BARS.map((b) => [b, new Float64Array(PARAMS.samples + 1)])) as Record<Bar, Float64Array>;
    const honesty = Object.fromEntries(BARS.map((b) => [b, { error: 0, above90: 0, backwards: 0 }])) as Record<Bar, Honesty>;
    let total = 0;
    const work = () => {
      if (cancelled) return;
      if (!visible.current) { timer = window.setTimeout(work, 200); return; }
      const until = performance.now() + 8;
      while (seed <= runs && performance.now() < until) {
        const t = trace(makeJob(seed++, options), workers, bars);
        total += t.total;
        for (const b of bars) { for (let k = 0; k <= PARAMS.samples; k++) { sums[b][k] += t.curves[b][k]; gapSums[b][k] += Math.abs(t.curves[b][k] - k / PARAMS.samples); } honesty[b].error += t.honesty[b].error; honesty[b].above90 += t.honesty[b].above90; honesty[b].backwards = Math.max(honesty[b].backwards, t.honesty[b].backwards); }
      }
      const n = seed - 1;
      setResult({ done: n, of: runs, total: total / n, gaps: Object.fromEntries(BARS.map((b) => [b, gapSums[b].map((v) => v / n)])) as Record<Bar, Float64Array>, curves: Object.fromEntries(BARS.map((b) => [b, sums[b].map((v) => v / n)])) as Record<Bar, Float64Array>,
        honesty: Object.fromEntries(BARS.map((b) => [b, { error: honesty[b].error / n, above90: honesty[b].above90 / n, backwards: honesty[b].backwards }])) as Record<Bar, Honesty> });
      if (seed <= runs) timer = window.setTimeout(work, 0);
    };
    timer = window.setTimeout(work, 0);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for the settings
  }, [key, visible]);
  return result;
}
