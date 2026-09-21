"use client";

import { Pause, Play, RotateCcw, Shuffle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "@/components/lab/use-reduced-motion";
import { Button } from "@/components/ui/button";
import { CalibrationChart, type Curve, FILL } from "./chart";
import { useLabels } from "./labels";
import { type Bar, DEFAULT_JOB, makeJob, PARAMS, schedule, trace } from "./sim";
import { useVisible } from "./use-visible";

const SECONDS = 16, SHOWN: Bar[] = ["count", "work", "plan"], KIND = ["fill-chart-1", "fill-chart-2", "fill-chart-3", "fill-chart-5"];

/** Fig. 01: one job, four workers, three progress bars watching it, and the clock they are all trying to guess. */
export function RaceLab() {
  const t = useLabels(), reduced = useReducedMotion(), root = useRef<HTMLDivElement>(null), visible = useVisible(root);
  // Job 77 is the one of the first 300 whose three bars are closest to the average of all of them (RESULTS.md): typical, not the worst.
  const [seed, setSeed] = useState(77), [at, setAt] = useState(0), [playing, setPlaying] = useState(false);
  const { job, run, curves } = useMemo(() => { const job = makeJob(seed, DEFAULT_JOB); return { job, run: schedule(job.tasks, PARAMS.workers, job.tasks.map((x) => x.duration)), curves: trace(job, PARAMS.workers, SHOWN).curves }; }, [seed]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible.current || document.hidden) { last = 0; return; }
      const dt = last ? (now - last) / 1000 : 0; last = now;
      setAt((v) => { const next = Math.min(1, v + dt / SECONDS); if (next >= 1) setPlaying(false); return next; });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, visible]);

  const value = (bar: Bar) => { const p = curves[bar], f = at * PARAMS.samples, k = Math.min(PARAMS.samples - 1, Math.floor(f)); return p[k] + (p[k + 1] - p[k]) * (f - k); };
  const list: Curve[] = SHOWN.map((bar) => ({ bar, label: t.barsShort[bar], points: curves[bar] }));
  const start = () => { if (reduced) { setAt(1); return; } if (at >= 1) setAt(0); setPlaying(true); }; // reduced motion: straight to the finished run
  const lane = 12, width = 600;

  return (
    <div ref={root} className="grid gap-4 text-sm">
      <svg viewBox={`0 0 ${width} ${PARAMS.workers * lane + 4}`} className="w-full" role="img" aria-label={t.timeline}>
        {job.tasks.map((task) => {
          const x = (run.start[task.id] / run.total) * width, w = Math.max(1, ((run.finish[task.id] - run.start[task.id]) / run.total) * width - 0.8), begun = run.start[task.id] / run.total <= at, over = run.finish[task.id] / run.total <= at;
          // Rounded: node and the browser disagree in the last digits of exp and log, and a hydrated attribute has to match.
          return <rect key={task.id} x={x.toFixed(2)} y={run.worker[task.id] * lane + 2} width={w.toFixed(2)} height={lane - 3} rx={1.5} className={KIND[task.kind % KIND.length]} opacity={over ? 0.9 : begun ? 0.5 : 0.12} />;
        })}
        <line x1={at * width} x2={at * width} y1={0} y2={PARAMS.workers * lane + 4} className="stroke-foreground" strokeWidth={1.5} />
      </svg>
      <div className="grid gap-5 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] sm:items-center">
        <div className="grid gap-2.5">
          {SHOWN.map((bar) => (
            <div key={bar} className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-x-3 gap-y-0.5" data-testid={`race-${bar}`}>
              <span className="label col-span-2">{t.bars[bar]}</span>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={t.bars[bar]} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value(bar) * 100)}><div className={`h-full ${FILL[bar]}`} style={{ width: `${value(bar) * 100}%` }} /></div>
              <span className="text-right font-mono tabular">{Math.round(value(bar) * 100)}%</span>
            </div>
          ))}
          <div className="mt-1 grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-x-3 gap-y-0.5 border-t border-border pt-2.5" data-testid="race-time">
            <span className="label col-span-2 text-foreground">{t.time} <span className="text-muted-foreground">{t.timeHint}</span></span>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-foreground" style={{ width: `${at * 100}%` }} /></div>
            <span className="text-right font-mono tabular">{Math.round(at * 100)}%</span>
          </div>
        </div>
        <CalibrationChart curves={list} label={t.chart} axis={{ x: t.timeAxis, y: t.shownAxis, honest: t.honest }} upTo={Math.max(0.01, at)} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" onClick={() => (playing ? setPlaying(false) : start())} data-testid="race-start">{playing ? <Pause aria-hidden /> : at >= 1 ? <RotateCcw aria-hidden /> : <Play aria-hidden />}{playing ? t.pause : at >= 1 ? t.again : t.start}</Button>
        <Button size="sm" variant="ghost" onClick={() => { setPlaying(false); setAt(0); setSeed((s) => s + 1); }}><Shuffle aria-hidden />{t.another}</Button>
      </div>
    </div>
  );
}
