"use client";

import { Dices } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { DIMS, gaussian, schedule } from "./diffusion";
import { useLabels } from "./labels";
import { getModel, useLab } from "./store";
import { useCloud } from "./use-cloud";

const PER_CLOUD = 1200, GAP = 1.2, STEP_CHOICES = [3, 5, 10, 20, 40];
const EXTENT: [number, number] = [GAP + 1.05, 1.2];
const LEFT = [-GAP, 0] as const, RIGHT = [GAP, 0] as const;
const WANTED = [[1, 0], [0, 1]];

/**
 * Fig. 03: one sampling run of the reader's own model, kept so that it can be scrubbed back and forth. It can also
 * show, at every step, where the model currently believes the points will end up, and run in fewer, bigger steps.
 */
export function StepsLab() {
  const t = useLabels();
  const { steps, generation } = useLab();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [count, setCount] = useState(40);
  const [at, setAt] = useState(0);
  const [guessing, setGuessing] = useState(false);
  const [sampledAt, setSampledAt] = useState(-1);
  const run = useRef<{ levels: number[]; points: Float64Array[]; guesses: Float64Array[] }>({ levels: [], points: [], guesses: [] });

  const sample = useCallback((stepCount: number) => {
    const cloud = Float64Array.from({ length: PER_CLOUD * 2 * DIMS }, () => gaussian(Math.random)), model = getModel(), levels = schedule(stepCount);
    const wanted = (i: number) => WANTED[Math.floor(i / PER_CLOUD)], points: Float64Array[] = [], guesses: Float64Array[] = [];
    for (let k = 0; k <= stepCount; k++) {
      points.push(cloud.slice());
      // At level 0 there is no noise left to remove: the guess is the cloud itself.
      guesses.push(levels[k] > 0 ? model.guess(cloud, levels[k], wanted) : cloud.slice());
      if (k < stepCount) model.denoise(cloud, levels[k], levels[k + 1], wanted);
    }
    run.current = { levels, points, guesses };
    setSampledAt(model.steps);
    setAt(stepCount);
  }, []);

  // A first run so there is something to look at; start over when the model above is thrown away.
  useEffect(() => {
    const id = window.setTimeout(() => sample(count), 0);
    return () => window.clearTimeout(id);
  }, [sample, count, generation]);

  useCloud(canvas, PER_CLOUD * 2, EXTENT, (view) => {
    const frame = (guessing ? run.current.guesses : run.current.points)[Math.min(at, run.current.points.length - 1)];
    if (frame) view.set(frame, (i) => (i < PER_CLOUD ? LEFT : RIGHT));
  });

  const shownAt = Math.min(at, count), levels = useMemo(() => schedule(count), [count]);
  return (
    <div className="grid gap-4 text-sm">
      <canvas ref={canvas} role="img" aria-label={t.stepsStage} className="aspect-[4/3] w-full rounded-md border border-border bg-[#070918] sm:aspect-[2/1]" />
      <label className="grid gap-2">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="label">{t.step}</span>
          <span className="font-mono tabular" data-testid="diffusion-step">{t.stepValue(shownAt, count, levels[shownAt])}</span>
        </span>
        <Slider value={[shownAt]} min={0} max={count} step={1} aria-label={t.step} onValueChange={(v) => setAt(Array.isArray(v) ? v[0] : v)} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset>
          <legend className="label mb-2">{t.stepCount}</legend>
          <div className="flex flex-wrap gap-1.5">
            {STEP_CHOICES.map((n) => (
              <Button key={n} size="sm" variant={count === n ? "default" : "outline"} aria-pressed={count === n} onClick={() => setCount(n)} data-testid={`diffusion-steps-${n}`}>{n}</Button>
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
        <Button variant="outline" onClick={() => sample(count)} data-testid="diffusion-sample">
          <Dices />
          {t.sample}
        </Button>
        <p className="min-w-0 flex-1 text-muted-foreground">{sampledAt <= 0 && steps === 0 ? t.needTraining : t.trainedFor(Math.max(0, sampledAt))}</p>
      </div>
    </div>
  );
}
