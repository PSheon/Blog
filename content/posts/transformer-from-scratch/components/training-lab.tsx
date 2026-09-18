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
  probe: Generation;
}

function view(trainer: Trainer, recent: boolean[], probe: number[]): View {
  const tail = trainer.losses.slice(-10);
  return {
    steps: trainer.steps,
    loss: tail.length ? tail.reduce((a, b) => a + b, 0) / tail.length : null,
    accuracy: recent.length ? recent.filter(Boolean).length / recent.length : null,
    losses: downsample(trainer.losses),
    probe: trainer.generate(probe),
  };
}

export function TrainingLab() {
  const t = useLabels();
  const rootRef = useRef<HTMLDivElement>(null);
  const [task, setTask] = useState<TaskName>("reverse");
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<Speed>("slow");
  const [text, setText] = useState("314159");
  // Bumped to throw the model away and start from fresh random weights.
  const [epoch, setEpoch] = useState(0);
  const [state, setState] = useState<View | null>(null);

  const trainerRef = useRef<{ key: string; trainer: Trainer; recent: boolean[] } | null>(null);
  const speedRef = useRef(speed);

  const valid = /^\d{6}$/.test(text);
  // The last complete entry keeps driving the figure while the reader is mid-edit.
  const [digits, setDigits] = useState<number[]>([3, 1, 4, 1, 5, 9]);
  const edit = (next: string) => {
    setText(next);
    if (/^\d{6}$/.test(next)) setDigits([...next].map(Number));
  };

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
    const paint = () => setState(view(trainer, recent, digits));

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
      if (++ticks % 3 === 0) paint();
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
  }, [task, epoch, running, digits]);

  const probe = state?.probe;
  const want = TASKS[task](digits);
  const trained = (state?.steps ?? 0) > 0;

  return (
    <div ref={rootRef} className="grid gap-6">
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
                "h-7 rounded-sm border px-2.5 text-xs transition-colors",
                task === name ? "border-signal bg-signal/10 text-signal" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t.tasks[name]}
            </button>
          ))}
        </div>
        <span className="label ml-auto">13,728 {t.params}</span>
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

      <div>
        <p className="label mb-1">{t.lossCurve}</p>
        {state && state.losses.length > 1 ? (
          <Sparkline values={state.losses} label={t.lossCurve} window={CURVE_POINTS} />
        ) : (
          <p className="grid h-14 place-items-center rounded-sm border border-dashed border-border text-xs text-muted-foreground">
            {t.untrained}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-y border-border py-4">
        <Button size="sm" onClick={() => setRunning(!running)} data-testid="tf-train">
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
                "h-7 rounded-sm border px-2.5 text-xs transition-colors",
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

      <div className="grid gap-5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-8">
        <div className="grid content-start gap-4">
          <label className="grid gap-1.5">
            <span className="label">{t.probe}</span>
            <span className="flex gap-1.5">
              <input
                value={text}
                onChange={(e) => edit(e.target.value.replace(/\D/g, "").slice(0, LENGTH))}
                inputMode="numeric"
                aria-invalid={!valid}
                aria-describedby="tf-probe-help"
                className="h-9 w-full min-w-0 rounded-sm border border-border bg-background px-2.5 font-mono text-base tracking-[0.3em] tabular aria-invalid:border-signal-2"
              />
              <Button
                size="icon"
                variant="outline"
                aria-label={t.random}
                title={t.random}
                onClick={() => edit(randomDigits(Math.random).join(""))}
              >
                <Dices />
              </Button>
            </span>
            <span id="tf-probe-help" className={cn("text-xs", valid ? "sr-only" : "text-signal-2")}>
              {t.probeHelp}
            </span>
          </label>

          <dl className="grid gap-2.5 font-mono text-base tabular">
            <div>
              <dt className="label">{t.output}</dt>
              <dd className="flex gap-1.5 tracking-[0.3em]" data-testid="tf-output">
                {(probe?.output ?? []).map((v, i) => (
                  <span key={i} className={v === want[i] ? "text-signal" : "text-signal-2"}>
                    {v === SEP ? "→" : v}
                  </span>
                ))}
              </dd>
            </div>
            <div>
              <dt className="label">{t.expected}</dt>
              <dd className="tracking-[0.3em] text-muted-foreground">{want.join("")}</dd>
            </div>
          </dl>
        </div>

        <div>
          <div className="grid grid-cols-2 gap-4 sm:gap-6">
            {[0, 1].map((h) => (
              <AttentionMap
                key={h}
                map={probe?.attention[0]?.[h] ?? null}
                tokens={probe?.tokens ?? []}
                title={t.head(h + 1)}
                label={`${t.head(h + 1)}: ${t.rowAxis} × ${t.colAxis}`}
              />
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t.heatHelp}</p>
        </div>
      </div>
    </div>
  );
}
