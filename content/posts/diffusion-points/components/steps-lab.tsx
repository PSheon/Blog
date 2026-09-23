"use client";

import { Dices } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { CloudNames } from "./cloud-names";
import { DIMS } from "./diffusion";
import { useLabels } from "./labels";
import { trajectory, useLab } from "./store";
import { useCloud } from "./use-cloud";
import { useFresh } from "./use-fresh";

const PER_CLOUD = 1200, GAP = 1.2, STEP_CHOICES = [3, 5, 10, 20, 40];
const EXTENT: [number, number] = [GAP + 1.05, 1.2];
const LEFT = [-GAP, 0] as const, RIGHT = [GAP, 0] as const;
const FRAME = PER_CLOUD * 2 * DIMS;

/**
 * Fig. 04: one sampling run of the reader's own model, kept so that it can be scrubbed back and forth. It can also
 * show, at every step, where the model currently believes the points will end up, and run in fewer, bigger steps.
 */
export function StepsLab() {
  const t = useLabels();
  const { pair, steps, running } = useLab();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [count, setCount] = useState(40);
  const [at, setAt] = useState(40);
  const [guessing, setGuessing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<{ count: number; levels: number[]; trainedFor: number } | null>(null);
  const data = useRef<{ points: Float32Array; guesses: Float32Array } | null>(null);

  const sample = useCallback(async (stepCount: number) => {
    setBusy(true);
    const reply = await trajectory(PER_CLOUD, stepCount);
    data.current = { points: reply.points, guesses: reply.guesses };
    setRun({ count: stepCount, levels: reply.levels, trainedFor: reply.trainedFor });
    setAt((old) => Math.min(old, stepCount));
    setBusy(false);
  }, []);

  useFresh(canvas, steps, run?.count === count ? run.trainedFor : -1, busy, running, () => void sample(count));

  const shown = run ? Math.min(at, run.count) : 0;
  useCloud(canvas, PER_CLOUD * 2, EXTENT, (view) => {
    const d = data.current;
    if (d) view.set((guessing ? d.guesses : d.points).subarray(shown * FRAME, (shown + 1) * FRAME), (i) => (i < PER_CLOUD ? LEFT : RIGHT));
  });

  return (
    <div className="grid gap-4 text-sm">
      <div className="relative">
        <canvas ref={canvas} role="img" aria-label={t.stepsStage} className="aspect-[4/3] w-full rounded-md border border-border bg-[#070918] sm:aspect-[2/1]" />
        <CloudNames names={[t.fruit[pair[0]], t.fruit[pair[1]]]} />
      </div>
      <label className="grid gap-2">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="label">{t.step}</span>
          <span className="font-mono tabular" data-testid="diffusion-step">{run ? t.stepValue(shown, run.count, run.levels[shown]) : "…"}</span>
        </span>
        <Slider value={[shown]} min={0} max={run?.count ?? count} step={1} aria-label={t.step} onValueChange={(v) => setAt(Array.isArray(v) ? v[0] : v)} />
      </label>
      {guessing && run && <p className="text-muted-foreground" aria-live="polite" data-testid="diffusion-guess-hint">{t.guessHint(run.levels[shown])}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset>
          <legend className="label mb-2">{t.stepCount}</legend>
          <div className="flex flex-wrap gap-1.5">
            {STEP_CHOICES.map((n) => (
              <Button key={n} size="sm" variant={count === n ? "default" : "outline"} aria-pressed={count === n} onClick={() => { setCount(n); setAt(n); }} data-testid={`diffusion-steps-${n}`}>{n}</Button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="label mb-2">{t.show}</legend>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant={guessing ? "outline" : "default"} aria-pressed={!guessing} onClick={() => setGuessing(false)}>{t.showPoints}</Button>
            <Button size="sm" variant={guessing ? "default" : "outline"} aria-pressed={guessing} onClick={() => setGuessing(true)} data-testid="diffusion-guess">{t.showGuess}</Button>
          </div>
        </fieldset>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void sample(count)} data-testid="diffusion-sample">
          <Dices />
          {t.sample}
        </Button>
        <p className="min-w-0 flex-1 text-muted-foreground" data-testid="diffusion-steps-note">{!run ? "…" : run.trainedFor === 0 ? t.needTraining : t.trainedFor(run.trainedFor)}</p>
      </div>
    </div>
  );
}
