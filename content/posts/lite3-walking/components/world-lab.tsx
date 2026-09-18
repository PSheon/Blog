"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Button } from "@/components/ui/button";
import { useLabels } from "./labels";
import { Param } from "./param";
import { DECIMATION } from "./policy";
import { useRig } from "./rig";
import type { Knobs, Lite3Sim } from "./sim";
import { Stage } from "./stage";
import { Traces } from "./traces";

const ID = "world";
const WINDOW = 8, RATE = 10, SLOTS = WINDOW * RATE;
/** The friction slider is logarithmic: 0 → μ 1 (rubber), 1 → μ 0.01. */
const mu = (slider: number) => Number((10 ** (-2 * slider)).toPrecision(2));

/** Fig. 05: make the simulator less clean, one way at a time: stale observations, noisy sensors, a slippery floor. */
export function WorldLab() {
  const t = useLabels();
  const { active } = useRig();
  const [latency, setLatency] = useState(0);
  const [noise, setNoise] = useState(0);
  const [ice, setIce] = useState(0);
  const [seen, setSeen] = useState({ got: [] as number[], speed: 0, slip: 0 });
  const trace = useRef({ got: [] as number[], speed: 0, since: 0 });
  const friction = mu(ice);
  const knobs = useMemo<Partial<Knobs>>(() => ({ latency, noise, friction }), [latency, noise, friction]);

  const onFrame = useCallback((sim: Lite3Sim, dt: number) => {
    const tr = trace.current, [vx, vy] = sim.velocity, yaw = sim.yaw;
    tr.speed += (vx * Math.cos(yaw) + vy * Math.sin(yaw) - tr.speed) * Math.min(1, dt / 0.35);
    if ((tr.since += dt) < 1 / RATE) return;
    tr.since = 0;
    tr.got = [...tr.got, tr.speed].slice(-SLOTS);
    setSeen({ got: tr.got, speed: tr.speed, slip: sim.footSlip });
  }, []);

  const clean = latency === 0 && noise === 0 && ice === 0;
  const live = active === ID;
  return (
    <div className="grid gap-4 text-sm">
      <Stage id={ID} knobs={knobs} onFrame={onFrame} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-4">
          <Param label={t.latency} shown={`${latency * DECIMATION} ms`} value={latency} min={0} max={8} step={1} onChange={setLatency} />
          <Param label={t.noise} shown={`±${noise.toFixed(2)}`} value={noise} min={0} max={0.8} step={0.05} onChange={setNoise} />
          <Param label={t.friction} shown={`μ ${friction}`} value={ice} min={0} max={1} step={0.05} onChange={setIce} />
          <Button size="sm" variant="outline" className="justify-self-start" disabled={clean} onClick={() => { setLatency(0); setNoise(0); setIce(0); }}>{t.cleanAgain}</Button>
        </div>
        <div className="grid content-start gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Readout label={t.speedAt05} value={live ? seen.speed.toFixed(2) : "–"} unit={t.mps} />
            <Readout label={t.slip} value={live ? seen.slip.toFixed(2) : "–"} unit={t.mps} tone="plain" />
          </div>
          <div>
            <p className="label">{t.speedTrace}</p>
            <Traces label={t.speedTrace} slots={SLOTS} range={[-0.3, 0.9]} series={[{ values: Array.from({ length: SLOTS }, () => 0.5), color: "var(--signal-2)", dashed: true }, { values: seen.got, color: "var(--signal)" }]} />
          </div>
        </div>
      </div>
    </div>
  );
}
