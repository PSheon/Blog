"use client";

import { Dices } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { DIMS, gaussian, schedule } from "./diffusion";
import { useLabels } from "./labels";
import { getModel, useLab } from "./store";
import { useCloud } from "./use-cloud";

const PER_CLOUD = 1200, STEPS = 40, GAP = 1.2;
const EXTENT: [number, number] = [GAP + 1.05, 1.2];
const LEFT = [-GAP, 0] as const, RIGHT = [GAP, 0] as const;
const LEVELS = schedule(STEPS);

/** Fig. 03: one sampling run of the reader's own model, kept so that it can be scrubbed back and forth. */
export function StepsLab() {
  const t = useLabels();
  const { steps, generation } = useLab();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [at, setAt] = useState(0);
  const [sampledAt, setSampledAt] = useState(-1);
  const frames = useRef<Float64Array[]>([]);

  const sample = useCallback(() => {
    const cloud = Float64Array.from({ length: PER_CLOUD * 2 * DIMS }, () => gaussian(Math.random)), model = getModel(), wanted = [[1, 0], [0, 1]];
    frames.current = [cloud.slice()];
    for (let k = 0; k < STEPS; k++) {
      model.denoise(cloud, LEVELS[k], LEVELS[k + 1], (i) => wanted[Math.floor(i / PER_CLOUD)]);
      frames.current.push(cloud.slice());
    }
    setSampledAt(model.steps);
    setAt(STEPS);
  }, []);

  // A first run so there is something to look at; start over when the model above is thrown away.
  useEffect(() => {
    const id = window.setTimeout(sample, 0);
    return () => window.clearTimeout(id);
  }, [sample, generation]);

  useCloud(canvas, PER_CLOUD * 2, EXTENT, (view) => {
    const frame = frames.current[at];
    if (frame) view.set(frame, (i) => (i < PER_CLOUD ? LEFT : RIGHT));
  });

  return (
    <div className="grid gap-4 text-sm">
      <canvas ref={canvas} role="img" aria-label={t.stepsStage} className="aspect-[4/3] w-full rounded-md border border-border bg-[#070918] sm:aspect-[2/1]" />
      <label className="grid gap-2">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="label">{t.step}</span>
          <span className="font-mono tabular">{t.stepValue(at, STEPS, LEVELS[at])}</span>
        </span>
        <Slider value={[at]} min={0} max={STEPS} step={1} aria-label={t.step} onValueChange={(v) => setAt(Array.isArray(v) ? v[0] : v)} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={sample} data-testid="diffusion-sample">
          <Dices />
          {t.sample}
        </Button>
        <p className="min-w-0 flex-1 text-muted-foreground">{sampledAt <= 0 && steps === 0 ? t.needTraining : t.trainedFor(Math.max(0, sampledAt))}</p>
      </div>
    </div>
  );
}
