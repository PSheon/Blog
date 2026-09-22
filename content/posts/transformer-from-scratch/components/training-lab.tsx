"use client";

import { Dices, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Sparkline } from "@/components/lab/sparkline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AttentionMap } from "./attention-map";
import { useLabels } from "./labels";
import { type Generation, LENGTH, SEP, TASKS, type TaskName, Trainer, randomDigits } from "./task";

const SPEEDS = { slow: 1, fast: 0 } as const; // steps per frame; 0 = as many as fit in the frame budget
type Speed = keyof typeof SPEEDS;
const ROLLING = 40;
const CURVE_POINTS = 240;
const STARTING_PROBLEM = [3, 1, 4, 1, 5, 9];

/** The whole loss history squeezed into a fixed number of points, each the mean of its bucket. */
function downsample(values: number[], points = CURVE_POINTS): number[] {
  if (values.length <= points) return values.slice();
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    const from = Math.floor((i * values.length) / points);
    const to = Math.max(from + 1, Math.floor(((i + 1) * values.length) / points));
    let sum = 0;
    for (let j = from; j < to; j++) sum += values[j];
    out.push(sum / (to - from));
  }
  return out;
}

interface View {
  steps: number;
  loss: number | null;
  accuracy: number | null;
  losses: number[];
  answer: Generation;
}

function view(trainer: Trainer, recent: boolean[], problem: number[]): View {
  const tail = trainer.losses.slice(-10);
  return {
    steps: trainer.steps,
    loss: tail.length ? tail.reduce((a, b) => a + b, 0) / tail.length : null,
    accuracy: recent.length ? recent.filter(Boolean).length / recent.length : null,
    losses: downsample(trainer.losses),
    answer: trainer.generate(problem),
  };
}

function Digits({ values, compare, className }: { values: number[]; compare?: number[]; className?: string }) {
  return (
    <span className={cn("inline-flex gap-[0.35em] font-mono tabular", className)}>
      {values.map((v, i) => (
        <span key={i} className={compare ? (v === compare[i] ? "text-signal" : "text-signal-2") : undefined}>
          {v === SEP ? "→" : v}
        </span>
      ))}
    </span>
  );
}

export function TrainingLab() {
  const t = useLabels();
  const rootRef = useRef<HTMLDivElement>(null);
  const [task, setTask] = useState<TaskName>("reverse");
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<Speed>("slow");
  // The one problem the reader follows: it is answered live above and explained by the maps below.
  const [problem, setProblem] = useState<number[]>(STARTING_PROBLEM);
  // Bumped to throw the model away and start from fresh random weights.
  const [epoch, setEpoch] = useState(0);
  const [state, setState] = useState<View | null>(null);

  const trainerRef = useRef<{ key: string; trainer: Trainer; recent: boolean[] } | null>(null);
  const speedRef = useRef(speed);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    const key = `${task}:${epoch}`;
    if (trainerRef.current?.key !== key) trainerRef.current = { key, trainer: new Trainer(task), recent: [] };
    const { trainer, recent } = trainerRef.current;

    let frame = 0;
    let visible = true;
    let ticks = 0;
    const paint = () => setState(view(trainer, recent, problem));

    const loop = () => {
      frame = requestAnimationFrame(loop);
      if (!visible) return;
      const perFrame = SPEEDS[speedRef.current];
      if (perFrame > 0) {
        for (let i = 0; i < perFrame; i++) trainer.step();
      } else {
        const deadline = performance.now() + 9;
        do trainer.step();
        while (performance.now() < deadline);
      }
      // Score one fresh sequence per frame: a rolling estimate that costs almost nothing.
      const sample = randomDigits(Math.random);
      const answer = TASKS[task](sample);
      recent.push(trainer.generate(sample).output.every((v, i) => v === answer[i]));
      if (recent.length > ROLLING) recent.shift();
      if (++ticks % 4 === 0) paint();
    };

    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    if (rootRef.current) io.observe(rootRef.current);
    const first = window.setTimeout(paint, 0);
    if (running) frame = requestAnimationFrame(loop);
    return () => {
      window.clearTimeout(first);
      cancelAnimationFrame(frame);
      io.disconnect();
    };
  }, [task, epoch, running, problem]);

  const trained = (state?.steps ?? 0) > 0;
  const shown = state?.answer;
  const want = TASKS[task](problem);

  // A sentence that reads the map for the reader: where does the "→" row look, in the head that is most decided?
  let reading = t.readingUntrained;
  if (trained && shown) {
    const T = shown.tokens.length;
    let best = { head: 0, col: 0, weight: -1 };
    shown.attention[0].forEach((map, head) => {
      for (let c = 0; c <= LENGTH; c++) {
        const w = map[LENGTH * T + c];
        if (w > best.weight) best = { head, col: c, weight: w };
      }
    });
    const source = shown.tokens[best.col];
    // Only tell the causal story when it is true: one cell clearly wins, and it holds the digit that got written.
    reading =
      best.weight >= 0.5 && source === shown.output[0]
        ? t.reading(best.head + 1, String(source), String(shown.output[0]))
        : t.readingDiffuse(Math.round(best.weight * 100));
  }

  return (
    <div ref={rootRef} className="grid gap-7">
      {/* 1 — what is being learned */}
      <section className="grid gap-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex items-center gap-1.5" role="group" aria-label={t.task}>
            <span className="label mr-1">{t.task}</span>
            {(Object.keys(TASKS) as TaskName[]).map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={task === name}
                onClick={() => {
                  setTask(name);
                  setRunning(false);
                }}
                className={cn(
                  "tap h-7 rounded-sm border px-2.5 text-xs transition-colors",
                  task === name ? "border-signal bg-signal/10 text-signal" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {t.tasks[name]}
              </button>
            ))}
          </div>
          <span className="label ml-auto">13,728 {t.params}</span>
        </div>

        <div className="rounded-md border border-border bg-background px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[0.9375rem]">{t.taskIntro[task]}</p>
            <Button size="sm" variant="ghost" className="-mt-1 -mr-2 shrink-0" onClick={() => setProblem(randomDigits(Math.random))}>
              <Dices />
              {t.reroll}
            </Button>
          </div>
          <dl className="mt-3 grid gap-x-8 gap-y-3 text-xl sm:grid-cols-3">
            <div>
              <dt className="label mb-1">{t.reads}</dt>
              <dd><Digits values={[...problem, SEP]} /></dd>
            </div>
            <div>
              <dt className="label mb-1">{t.writes}</dt>
              <dd><Digits values={want} className="text-muted-foreground" /></dd>
            </div>
            <div aria-live="off">
              <dt className="label mb-1">{t.writesNow}</dt>
              <dd data-testid="tf-output"><Digits values={shown?.output ?? []} compare={want} /></dd>
            </div>
          </dl>
        </div>
      </section>

      {/* 2 — train */}
      <section className="grid gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Button size="lg" onClick={() => setRunning(!running)} data-testid="tf-train">
            {running ? <Pause /> : <Play />}
            {running ? t.pause : trained ? t.resume : t.train}
          </Button>
          <div className="flex items-center gap-1.5" role="group" aria-label={t.speed}>
            <span className="label mr-1">{t.speed}</span>
            {(Object.keys(SPEEDS) as Speed[]).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={speed === s}
                onClick={() => setSpeed(s)}
                className={cn(
                  "tap h-7 rounded-sm border px-2.5 text-xs transition-colors",
                  speed === s ? "border-signal bg-signal/10 text-signal" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {t[s]}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => {
              setRunning(false);
              setEpoch((e) => e + 1);
            }}
          >
            <RotateCcw />
            {t.reset}
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Readout label={t.step} value={<span data-testid="tf-steps">{state?.steps ?? 0}</span>} tone="plain" />
          <Readout label={t.loss} value={state?.loss == null ? "–" : state.loss.toFixed(3)} tone="alt" />
          <Readout
            label={t.accuracy}
            value={<span data-testid="tf-accuracy">{state?.accuracy == null ? "–" : Math.round(state.accuracy * 100)}</span>}
            unit="%"
            large
          />
        </div>

        {state && state.losses.length > 1 ? (
          <div>
            <p className="label mb-1">{t.lossCurve}</p>
            <Sparkline values={state.losses} label={t.lossCurve} window={CURVE_POINTS} />
          </div>
        ) : (
          <p className="rounded-sm border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">{t.untrained}</p>
        )}
      </section>

      {/* 3 — look inside */}
      <section className="grid gap-4 border-t border-border pt-6">
        <p className="text-sm font-medium">{t.attention}</p>
        <div className="grid grid-cols-2 gap-4 sm:gap-8">
          {[0, 1].map((h) => (
            <AttentionMap
              key={h}
              map={shown?.attention[0]?.[h] ?? null}
              tokens={shown?.tokens ?? []}
              title={t.head(h + 1)}
              label={`${t.head(h + 1)}: ${t.rowAxis} × ${t.colAxis}`}
              rowAxis={t.rowAxis}
              colAxis={t.colAxis}
              veil={t.veil}
            />
          ))}
        </div>
        <p className="rounded-md border border-signal/30 bg-signal/5 px-3.5 py-3 text-sm leading-relaxed" data-testid="tf-reading">
          {reading}
        </p>
      </section>
    </div>
  );
}
