"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { DIMS, gaussian, schedule } from "./diffusion";
import { useLabels } from "./labels";
import { SHAPES, type ShapeName } from "./shapes";
import { getModel, resetModel, setPair, setRunning, useLab } from "./store";
import { useCloud } from "./use-cloud";

const PER_CLOUD = 1100, CLOUDS = 3, STEPS = 40, GAP = 1.75, HOLD_SECONDS = 1.4;
const EXTENT: [number, number] = [GAP + 1.05, 1.1], NARROW_EXTENT: [number, number] = [2.05, 2.05];
/** Side by side on a wide canvas; on a phone, the two fruit on top and their blend underneath. */
const WIDE = [[-GAP, 0], [0, 0], [GAP, 0]] as const, STACKED = [[-1, 0.95], [0, -0.95], [1, 0.95]] as const;
const NAMES = Object.keys(SHAPES) as ShapeName[];

/** Fig. 01: pick two fruit, train, and watch fresh noise settle into them (and into a blend) over and over. */
export function TrainLab() {
  const t = useLabels();
  const { pair, running, steps, loss, perSec, generation } = useLab();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [blend, setBlend] = useState(0.5);
  const run = useRef({ cloud: new Float64Array(PER_CLOUD * CLOUDS * DIMS), levels: schedule(STEPS), at: STEPS + 1, hold: HOLD_SECONDS, generation: -1, blend });
  useEffect(() => { run.current.blend = blend; }, [blend]);

  useCloud(canvas, PER_CLOUD * CLOUDS, EXTENT, (view, dt) => {
    const r = run.current;
    if (r.at > STEPS && ((r.hold += dt) > HOLD_SECONDS || r.generation !== generation)) {
      for (let i = 0; i < r.cloud.length; i++) r.cloud[i] = gaussian(Math.random);
      r.at = 0;
      r.hold = 0;
      r.generation = generation;
    }
    if (r.at < STEPS) {
      // Left cloud wants the first fruit, right cloud the second, the middle one a mix of the two.
      const wanted = [[1, 0], [1 - r.blend, r.blend], [0, 1]];
      getModel().denoise(r.cloud, r.levels[r.at], r.levels[r.at + 1], (i) => wanted[Math.floor(i / PER_CLOUD)]);
    }
    r.at++;
    const layout = view.narrow ? STACKED : WIDE;
    view.set(r.cloud, (i) => layout[Math.floor(i / PER_CLOUD)]);
  }, NARROW_EXTENT);

  const choose = (side: 0 | 1, name: ShapeName) => setPair(side === 0 ? [name, pair[1]] : [pair[0], name]);
  return (
    <div className="grid gap-4 text-sm">
      <canvas ref={canvas} role="img" aria-label={t.stage} className="aspect-[4/3] w-full rounded-md border border-border bg-[#070918] sm:aspect-[5/2]" data-testid="diffusion-stage" />
      <p className="text-muted-foreground" aria-live="polite">{steps === 0 ? t.untrained : running ? t.learning : t.paused}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {([0, 1] as const).map((side) => (
          <fieldset key={side} className="grid gap-2">
            <legend className="label mb-2">{side === 0 ? t.left : t.right}</legend>
            <div className="flex flex-wrap gap-1.5">
              {NAMES.map((name) => (
                <Button key={name} size="sm" variant={pair[side] === name ? "default" : "outline"} aria-pressed={pair[side] === name} disabled={pair[1 - side] === name} onClick={() => choose(side, name)}>
                  {t.fruit[name]}
                </Button>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <label className="grid gap-2">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="label">{t.blend}</span>
          <span className="font-mono tabular">{t.blendValue(t.fruit[pair[0]], t.fruit[pair[1]], blend)}</span>
        </span>
        <Slider value={[blend]} min={0} max={1} step={0.05} aria-label={t.blend} onValueChange={(v) => setBlend(Array.isArray(v) ? v[0] : v)} />
      </label>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex gap-1.5">
          <Button onClick={() => setRunning(!running)} data-testid="diffusion-train">
            {running ? <Pause /> : <Play />}
            {running ? t.pause : steps ? t.resume : t.train}
          </Button>
          <Button variant="ghost" disabled={steps === 0} onClick={() => resetModel()}>
            <RotateCcw />
            {t.reset}
          </Button>
        </div>
        <div className={cn("grid grid-cols-3 gap-6", steps === 0 && "opacity-50")}>
          <Readout label={t.steps} value={<span data-testid="diffusion-steps">{steps.toLocaleString()}</span>} />
          <Readout label={t.loss} value={loss ? loss.toFixed(3) : "–"} tone="plain" />
          <Readout label={t.perSec} value={perSec ? perSec.toFixed(0) : "–"} tone="plain" />
        </div>
      </div>
    </div>
  );
}
