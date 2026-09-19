"use client";

import { Dices } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { DIMS, gaussian, schedule } from "./diffusion";
import { useLabels } from "./labels";
import { getModel, useLab } from "./store";
import { useCloud } from "./use-cloud";

const PER_CLOUD = 1200, GAP = 1.2, STEPS = 40;
const EXTENT: [number, number] = [GAP + 1.05, 1.2];
const LEFT = [-GAP, 0] as const, RIGHT = [GAP, 0] as const;
const WANTED = [[1, 0], [0, 1]], LEVELS = schedule(STEPS);

/** Fig. 05: classifier-free guidance. Turn up how much the model listens to "which fruit" and sample again. */
export function GuidanceLab() {
  const t = useLabels();
  const { steps, generation } = useLab();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [guidance, setGuidance] = useState(1);
  const [sampledAt, setSampledAt] = useState(-1);
  const cloud = useRef(new Float64Array(PER_CLOUD * 2 * DIMS));
  // The same starting noise for every setting, so that the slider is the only thing that changes.
  const start = useRef<Float64Array | null>(null);

  const sample = useCallback((w: number, fresh: boolean) => {
    if (fresh || !start.current) start.current = Float64Array.from({ length: PER_CLOUD * 2 * DIMS }, () => gaussian(Math.random));
    const x = start.current.slice(), model = getModel();
    for (let k = 0; k < STEPS; k++) model.denoise(x, LEVELS[k], LEVELS[k + 1], (i) => WANTED[Math.floor(i / PER_CLOUD)], w);
    cloud.current = x;
    setSampledAt(model.steps);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => sample(guidance, false), 0);
    return () => window.clearTimeout(id);
  }, [sample, guidance, generation]);

  useCloud(canvas, PER_CLOUD * 2, EXTENT, (view) => view.set(cloud.current, (i) => (i < PER_CLOUD ? LEFT : RIGHT)));

  return (
    <div className="grid gap-4 text-sm">
      <canvas ref={canvas} role="img" aria-label={t.guidanceStage} className="aspect-[4/3] w-full rounded-md border border-border bg-[#070918] sm:aspect-[2/1]" />
      <label className="grid gap-2">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="label">{t.guidance}</span>
          <span className="font-mono tabular" data-testid="diffusion-guidance">{t.guidanceValue(guidance)}</span>
        </span>
        <Slider value={[guidance]} min={0} max={6} step={0.5} aria-label={t.guidance} onValueChange={(v) => setGuidance(Array.isArray(v) ? v[0] : v)} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => sample(guidance, true)}>
          <Dices />
          {t.sample}
        </Button>
        <p className="min-w-0 flex-1 text-muted-foreground">{sampledAt <= 0 && steps === 0 ? t.needTraining : t.trainedFor(Math.max(0, sampledAt))}</p>
      </div>
    </div>
  );
}
