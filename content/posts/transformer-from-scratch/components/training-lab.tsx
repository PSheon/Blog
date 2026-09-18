"use client";

import { ArrowRight, Check, Dices, Pause, Play, RotateCcw, X } from "lucide-react";
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
// π, e and φ: recognisable, and none of them is a palindrome.
const STARTING_QUIZ = [[3, 1, 4, 1, 5, 9], [2, 7, 1, 8, 2, 8], [1, 6, 1, 8, 0, 3]];

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
  answers: Generation[];
}

function view(trainer: Trainer, recent: boolean[], problems: number[][]): View {
  const tail = trainer.losses.slice(-10);
  return {
    steps: trainer.steps,
    loss: tail.length ? tail.reduce((a, b) => a + b, 0) / tail.length : null,
    accuracy: recent.length ? recent.filter(Boolean).length / recent.length : null,
    losses: downsample(trainer.losses),
    answers: problems.map((p) => trainer.generate(p)),
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
  const [quiz, setQuiz] = useState<number[][]>(STARTING_QUIZ);
  const [own, setOwn] = useState("");
  const [selected, setSelected] = useState(0);
  // Bumped to throw the model away and start from fresh random weights.
  const [epoch, setEpoch] = useState(0);
  const [state, setState] = useState<View | null>(null);

  const trainerRef = useRef<{ key: string; trainer: Trainer; recent: boolean[] } | null>(null);
  const speedRef = useRef(speed);

  const ownValid = /^\d{6}$/.test(own);
  const [ownDigits, setOwnDigits] = useState<number[] | null>(null);
  const problems = ownDigits ? [...quiz, ownDigits] : quiz;

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
    const paint = () => setState(view(trainer, recent, problems));

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
    // `problems` is derived from quiz + ownDigits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task, epoch, running, quiz, ownDigits]);

  const trained = (state?.steps ?? 0) > 0;
  const index = Math.min(selected, problems.length - 1);
  const shown = state?.answers[index];
  const example = STARTING_QUIZ[0];

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

        <div className="rounded-md border border-border bg-background px-4 py-3.5">
          <p className="text-[0.9375rem]">{t.taskIntro[task]}</p>
          <p className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3 text-xl">
            <span>
              <span className="label mb-1 block">{t.reads}</span>
              <Digits values={[...example, SEP]} />
            </span>
            <span>
              <span className="label mb-1 block">{t.writes}</span>
              <Digits values={TASKS[task](example)} className="text-signal" />
            </span>
          </p>
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

      {/* 3 — watch it answer */}
      <section className="grid gap-3 border-t border-border pt-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">{t.quiz}</h3>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setQuiz(STARTING_QUIZ.map(() => randomDigits(Math.random)))}
          >
            <Dices />
            {t.reroll}
          </Button>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{t.quizHelp}</p>

        <ul className="grid gap-1.5" data-testid="tf-quiz">
          {problems.map((digits, i) => {
            const want = TASKS[task](digits);
            const got = state?.answers[i]?.output ?? [];
            const ok = got.length === LENGTH && got.every((v, k) => v === want[k]);
            return (
              <li key={`${i}:${digits.join("")}`}>
                <button
                  type="button"
                  aria-pressed={index === i}
                  onClick={() => setSelected(i)}
                  className={cn(
                    "grid w-full grid-cols-[1fr_auto_1fr_auto] items-center gap-3 rounded-md border px-3 py-2 text-left text-base transition-colors sm:text-lg",
                    index === i ? "border-signal bg-signal/5" : "border-border hover:border-foreground/30",
                  )}
                >
                  <Digits values={digits} />
                  <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
                  <Digits values={got} compare={want} />
                  <span className={cn("flex items-center gap-1 text-xs", ok ? "text-signal" : "text-signal-2")}>
                    {ok ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
                    <span className="sr-only sm:not-sr-only">{ok ? t.right : t.wrong}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <label className="mt-1 grid gap-1.5 sm:grid-cols-[auto_12rem] sm:items-center sm:justify-start sm:gap-x-3">
          <span className="text-sm">{t.yourOwn}</span>
          <input
            value={own}
            onChange={(e) => {
              const next = e.target.value.replace(/\D/g, "").slice(0, LENGTH);
              setOwn(next);
              if (/^\d{6}$/.test(next)) {
                setOwnDigits([...next].map(Number));
                setSelected(quiz.length);
              } else if (next === "") {
                setOwnDigits(null);
              }
            }}
            inputMode="numeric"
            placeholder="271828"
            aria-invalid={own !== "" && !ownValid}
            aria-describedby="tf-own-help"
            data-testid="tf-own"
            className="h-9 w-full min-w-0 rounded-sm border border-border bg-background px-2.5 font-mono text-base tracking-[0.3em] tabular placeholder:text-muted-foreground/40 aria-invalid:border-signal-2"
          />
          <span id="tf-own-help" className="text-xs leading-relaxed text-muted-foreground sm:col-span-2">
            {t.yourOwnHelp}
          </span>
        </label>
      </section>

      {/* 4 — look inside */}
      <section className="grid gap-4 border-t border-border pt-6">
        <h3 className="text-sm font-medium">{t.attention}</h3>
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
