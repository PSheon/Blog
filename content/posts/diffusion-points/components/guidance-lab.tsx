"use client";

import { Dices } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { CloudNames } from "./cloud-names";
import { DIMS, gaussian } from "./diffusion";
import { useLabels } from "./labels";
import { guided, useLab } from "./store";
import { useCloud } from "./use-cloud";
import { useFresh } from "./use-fresh";

const PER_CLOUD = 1200, GAP = 1.2, STEPS = 40;
const EXTENT: [number, number] = [GAP + 1.05, 1.2];
const LEFT = [-GAP, 0] as const, RIGHT = [GAP, 0] as const;

/** Fig. 05: classifier-free guidance. Turn up how much the model listens to "which fruit" and sample again. */
export function GuidanceLab() {
  const t = useLabels();
  const { pair, steps, running } = useLab();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [guidance, setGuidance] = useState(1);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<{ guidance: number; trainedFor: number } | null>(null);
  const cloud = useRef<Float32Array | null>(null);
  // The same starting noise for every setting, so that the slider is the only thing that changes.
  const start = useRef<Float32Array | null>(null);

  const sample = useCallback(async (w: number, fresh: boolean) => {
    if (fresh || !start.current) start.current = Float32Array.from({ length: PER_CLOUD * 2 * DIMS }, () => gaussian(Math.random));
    setBusy(true);
    const reply = await guided(PER_CLOUD, STEPS, w, start.current);
    cloud.current = reply.cloud;
    setShown({ guidance: w, trainedFor: reply.trainedFor });
    setBusy(false);
  }, []);

  useFresh(canvas, steps, shown?.guidance === guidance ? shown.trainedFor : -1, busy, running, () => void sample(guidance, false));
  useCloud(canvas, PER_CLOUD * 2, EXTENT, (view) => { if (cloud.current) view.set(cloud.current, (i) => (i < PER_CLOUD ? LEFT : RIGHT)); });

  return (
    <div className="grid gap-4 text-sm">
      <div className="relative">
        <canvas ref={canvas} role="img" aria-label={t.guidanceStage} className="aspect-[4/3] w-full rounded-md border border-border bg-[#070918] sm:aspect-[2/1]" />
        <CloudNames names={[t.fruit[pair[0]], t.fruit[pair[1]]]} />
      </div>
      <label className="grid gap-2">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="label">{t.guidance}</span>
          <span className="font-mono tabular" data-testid="diffusion-guidance">{t.guidanceValue(guidance)}</span>
        </span>
        <Slider value={[guidance]} min={0} max={6} step={0.5} aria-label={t.guidance} onValueChange={(v) => setGuidance(Array.isArray(v) ? v[0] : v)} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={busy} onClick={() => void sample(guidance, true)}>
          <Dices />
          {t.sample}
        </Button>
        <p className="min-w-0 flex-1 text-muted-foreground">{!shown ? "…" : shown.trainedFor === 0 ? t.needTraining : t.trainedFor(shown.trainedFor)}</p>
      </div>
    </div>
  );
}
