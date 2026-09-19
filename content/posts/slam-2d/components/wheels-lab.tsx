"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { useReducedMotion } from "@/components/lab/use-reduced-motion";
import { Button } from "@/components/ui/button";
import { mulberry32 } from "@/lib/ml";
import { Car, autopilot } from "./car";
import { useLabels } from "./labels";
import { PINK, car as drawCar, path, prepare, ringView, walls } from "./paint";
import { Param } from "./param";
import { type Pose, compose } from "./se2";
import { useVisible } from "./use-visible";
import { RING } from "./world";

const START: Pose = { x: 2, y: 2, theta: 0 }, ROUTE: [number, number][] = [[18, 2], [18, 12], [2, 12], [2, 2]];

/** Two laps on autopilot: the path really driven, and the path you get by adding up what the wheels report. */
function twoLaps(drift: number): { truth: Pose[]; wheels: Pose[] } {
  const c = new Car(RING, START, mulberry32(7), drift), truth: Pose[] = [], wheels: Pose[] = [];
  for (let target = 0, reached = 0, guard = 0; reached < 8 && guard < 20000; guard++) {
    const a = autopilot(c.truth, ROUTE, target);
    if (a.target !== target) reached++;
    target = a.target;
    c.step(a.controls, 1 / 30);
    if (guard % 4 === 0) { truth.push(c.truth); wheels.push(compose(START, c.deadReckoning)); }
  }
  return { truth, wheels };
}

/** Fig. 02: what happens if the car trusts its wheels and nothing else. */
export function WheelsLab() {
  const t = useLabels(), still = useReducedMotion();
  const root = useRef<HTMLDivElement>(null), view = useRef<HTMLCanvasElement>(null), visible = useVisible(root);
  const [drift, setDrift] = useState(0.006);
  const [run, setRun] = useState(0);
  const laps = useMemo(() => twoLaps(drift), [drift]);
  const end = laps.truth.length - 1, off = Math.hypot(laps.wheels[end].x - laps.truth[end].x, laps.wheels[end].y - laps.truth[end].y);

  useEffect(() => {
    let frame = 0, shown = still ? end : 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      if (!visible.current) return;
      shown = Math.min(end, shown + 6);
      const p = prepare(view.current);
      if (!p) return;
      const v = ringView(p.w, p.h);
      walls(p.ctx, v, RING, p.ink, 0.35);
      path(p.ctx, v, laps.truth.slice(0, shown + 1), p.ink, 2);
      path(p.ctx, v, laps.wheels.slice(0, shown + 1), PINK, 2);
      drawCar(p.ctx, v, laps.truth[shown], p.ink);
      drawCar(p.ctx, v, laps.wheels[shown], PINK);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [laps, end, run, still, visible]);

  return (
    <div ref={root} className="grid gap-4 text-sm">
      <canvas ref={view} className="aspect-[3/2] w-full rounded-md border border-border text-foreground" />
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
