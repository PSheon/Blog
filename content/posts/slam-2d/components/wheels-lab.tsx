"use client";

import { useEffect, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { useReducedMotion } from "@/components/lab/use-reduced-motion";
import { Button } from "@/components/ui/button";
import { mulberry32 } from "@/lib/ml";
import { Car, driveLapsSliced } from "./car";
import { useLabels } from "./labels";
import { PINK } from "./paint";
import { Param } from "./param";
import { type Pose, compose } from "./se2";
import { CYAN_HEX, PINK_HEX, place, setPoints, useStage3D } from "./stage3d";
import { useReplay } from "./use-replay";
import { useVisible } from "./use-visible";
import { RING } from "./world";

const START: Pose = { x: 2, y: 2, theta: 0 };

/** Two laps on autopilot: the path really driven, and the path you get by adding up what the wheels report. */
interface Laps { truth: Pose[]; wheels: Pose[] }
async function twoLaps(drift: number, cancelled: () => boolean): Promise<Laps | null> {
  const c = new Car(RING, START, mulberry32(7), drift), truth: Pose[] = [], wheels: Pose[] = [];
  const done = await driveLapsSliced(c, 2, (_, step) => { if (step % 4 === 0) { truth.push(c.truth); wheels.push(compose(START, c.deadReckoning)); } }, cancelled);
  return done ? { truth, wheels } : null;
}

/** Fig. 02: what happens if the car trusts its wheels and nothing else. */
export function WheelsLab() {
  const shell = useRef<HTMLDivElement>(null);
  const [drift, setDrift] = useState(0.006);
  const laps = useReplay(shell, drift, (cancelled) => twoLaps(drift, cancelled));
  return (
    <div ref={shell}>
      {laps ? <Wheels laps={laps} drift={drift} setDrift={setDrift} /> : <div className="aspect-[16/10] w-full animate-pulse rounded-md border border-border bg-muted/40" aria-busy />}
    </div>
  );
}

function Wheels({ laps, drift, setDrift }: { laps: Laps; drift: number; setDrift(v: number): void }) {
  const t = useLabels(), still = useReducedMotion();
  const root = useRef<HTMLDivElement>(null), view = useRef<HTMLCanvasElement>(null), visible = useVisible(root);
  const [run, setRun] = useState(0);
  const end = laps.truth.length - 1, off = Math.hypot(laps.wheels[end].x - laps.truth[end].x, laps.wheels[end].y - laps.truth[end].y);

  const shown = useRef(0);
  useEffect(() => { shown.current = still ? end : 0; }, [laps, end, run, still]);
  useStage3D(
    view, visible,
    (stage) => {
      stage.walls(RING, 0.8, 0.22);
      stage.aim(10, 6.4, 15, 19);
      return { truth: stage.line(stage.ink), wheels: stage.line(PINK_HEX), carTruth: stage.car(CYAN_HEX), carWheels: stage.car(PINK_HEX) };
    },
    (stage, o) => {
      shown.current = Math.min(end, shown.current + 6);
      const upTo = (poses: Pose[], z: number) => poses.slice(0, shown.current + 1).flatMap((q) => [q.x, q.y, z]);
      setPoints(stage.T, o.truth, upTo(laps.truth, 0.05));
      setPoints(stage.T, o.wheels, upTo(laps.wheels, 0.08));
      place(o.carTruth, laps.truth[shown.current]);
      place(o.carWheels, laps.wheels[shown.current]);
    },
  );

  return (
    <div ref={root} className="grid gap-4 text-sm">
      <canvas role="img" aria-label={t.picWheels} ref={view} className="aspect-[16/10] w-full rounded-md border border-border text-foreground" />
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded bg-foreground" />{t.truePath}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded" style={{ background: PINK }} />{t.wheelPath}</span>
      </p>
      <div className="grid items-end gap-4 sm:grid-cols-[1fr_auto_auto]">
        <Param label={t.drift} shown={`${drift.toFixed(3)} ${t.driftUnit}`} value={drift} min={0} max={0.03} step={0.002} onChange={setDrift} />
        <Readout label={t.endError} value={off.toFixed(1)} unit={t.metres} tone="alt" />
        <Button size="sm" variant="outline" onClick={() => setRun((r) => r + 1)}>{t.replay}</Button>
      </div>
    </div>
  );
}
