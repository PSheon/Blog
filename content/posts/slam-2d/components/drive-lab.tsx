"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Button } from "@/components/ui/button";
import { mulberry32 } from "@/lib/ml";
import { Car, type Controls, autopilot } from "./car";
import { useLabels } from "./labels";
import { DriveView } from "./drive-view3d";
import { CYAN, PINK, VIOLET } from "./paint";
import { Param } from "./param";
import { type Pose, compose } from "./se2";
import { DEFAULTS, Slam } from "./slam";
import { Stick } from "./stick";
import { useVisible } from "./use-visible";
import { RING } from "./world";

const START: Pose = { x: 2, y: 2, theta: 0 }, ROUTE: [number, number][] = [[18, 2], [18, 12], [2, 12], [2, 2]];
const MAX_KEYFRAMES = 320;

interface Knobs { drift: number; loopClosure: boolean; camera: boolean }
interface World { car: Car; slam: Slam; wheels: Pose[]; target: number; flash: number; lastFix: number; wrong: { from: number; to: number } | null }

const fresh = (k: Knobs): World => ({
  car: new Car(RING, START, mulberry32(7), k.drift),
  slam: new Slam({ ...DEFAULTS, loopClosure: k.loopClosure, candidates: k.camera ? "appearance" : "position" }),
  wheels: [], target: 0, flash: 0, lastFix: 0, wrong: null,
});

/**
 * Figs. 01 and 05: drive the car and watch the map it draws of a world it cannot see. `breakable` adds the switches
 * that make it fail: no loop closure, wheels too wrong for it to notice it is back, and one deliberately wrong link.
 */
export function DriveLab({ breakable = false }: { breakable?: boolean }) {
  const t = useLabels();
  const root = useRef<HTMLDivElement>(null), stage = useRef<HTMLCanvasElement>(null), glow = useRef<HTMLDivElement>(null);
  const view = useRef<DriveView | null>(null);
  const hintId = useId();
  const visible = useVisible(root);
  const keys = useRef<Controls>({ throttle: 0, steer: 0 });
  const [auto, setAuto] = useState(false);
  const [knobs, setKnobs] = useState<Knobs>({ drift: 0.006, loopClosure: true, camera: false });
  const [seen, setSeen] = useState({ error: 0, wheels: 0, closures: 0, lastFix: 0, keyframes: 0, wrong: false });
  const world = useRef<World | null>(null);

  const restart = (k: Knobs) => { world.current = fresh(k); setKnobs(k); };

  useEffect(() => {
    let cancelled = false;
    void import("three").then((T) => { if (!cancelled && stage.current) view.current = new DriveView(T, stage.current, RING); });
    return () => { cancelled = true; view.current?.dispose(); view.current = null; };
  }, []);

  useEffect(() => {
    if (!world.current) world.current = fresh(knobs);
    let frame = 0, prev = performance.now(), since = 0;
    const wide = window.matchMedia("(min-width: 640px)");
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const w = world.current!, dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      if (!visible.current) return;
      let controls = keys.current;
      if (auto) { const a = autopilot(w.car.truth, ROUTE, w.target); controls = a.controls; w.target = a.target; }
      if ((controls.throttle || controls.steer) && w.slam.keyframes.length < MAX_KEYFRAMES) {
        const odometry = w.car.step(controls, dt), before = w.slam.pose;
        if (w.slam.step(odometry, w.car.lastScan.points, w.car.lastScan.panorama)) {
          const after = w.slam.pose;
          w.lastFix = Math.hypot(after.x - before.x, after.y - before.y);
          if (w.lastFix > 0.3) w.flash = 1;
        }
        w.wheels.push(w.car.deadReckoning);
      }
      if (auto && w.slam.keyframes.length >= MAX_KEYFRAMES) setAuto(false);
      w.flash *= 0.93;
      view.current?.render({ truth: w.car.truth, scan: w.car.lastScan.points, slam: w.slam, wheels: w.wheels, origin: START, wrong: w.wrong }, !wide.matches);
      if (glow.current) glow.current.style.opacity = String(w.flash > 0.02 ? w.flash * 0.3 : 0);
      if ((since += dt) > 0.3) {
        since = 0;
        const believed = compose(START, w.slam.pose), wheels = compose(START, w.car.deadReckoning), at = w.car.truth;
        setSeen({ error: Math.hypot(believed.x - at.x, believed.y - at.y), wheels: Math.hypot(wheels.x - at.x, wheels.y - at.y), closures: w.slam.closures.length, lastFix: w.lastFix, keyframes: w.slam.keyframes.length, wrong: !!w.wrong });
      }
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [auto, knobs, visible]);

  // Stick right = turn right = clockwise = negative.
  const steer = (x: number, y: number) => { keys.current = { throttle: y, steer: -x }; };
  const sabotage = () => {
    const w = world.current;
    if (!w || w.wrong) return;
    w.wrong = w.slam.injectFalseClosure();
    if (w.wrong) w.flash = 1;
  };

  return (
    <div ref={root} className="grid gap-4 text-sm">
      <div className="relative">
        <canvas ref={stage} className="aspect-[3/4] w-full rounded-md border border-border text-foreground sm:aspect-[2/1]" />
        <div ref={glow} className="pointer-events-none absolute right-0 bottom-0 h-[calc(50%-5px)] w-full rounded-md opacity-0 sm:h-full sm:w-[calc(50%-5px)]" style={{ background: VIOLET }} aria-hidden />
        {seen.keyframes >= MAX_KEYFRAMES && (
          <div className="absolute inset-0 grid place-items-center rounded-md bg-background/70 backdrop-blur-sm" role="status">
            <div className="grid justify-items-center gap-3 text-center">
              <p>{t.full}</p>
              <Button size="sm" onClick={() => restart(knobs)}>{t.reset}</Button>
            </div>
          </div>
        )}
        <span className="label absolute top-2 left-2">{t.real}</span>
        <span className="label absolute top-[calc(50%+0.75rem)] left-2 sm:top-2 sm:left-[calc(50%+0.75rem)]">{t.believed}</span>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
        <Swatch color={CYAN} label={t.legendSlam} /> <Swatch color={PINK} label={t.legendWheels} /> <Swatch color={VIOLET} label={t.legendLoop} />
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Stick label={t.stick} hintId={hintId} onChange={steer} testId="slam-stick" />
        <div className="grid min-w-0 flex-1 gap-3">
          <p id={hintId} className="text-muted-foreground">{t.driveHint}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setAuto((a) => !a)}>{auto ? t.stopAutopilot : t.autopilot}</Button>
            <Button size="sm" variant="ghost" onClick={() => restart(knobs)}>{t.reset}</Button>
          </div>
        </div>
      </div>
      {breakable && (
        <div className="grid gap-4 rounded-md border border-border p-3 sm:grid-cols-2">
          <Param label={t.drift} shown={`${knobs.drift.toFixed(3)} ${t.driftUnit}`} value={knobs.drift} min={0} max={0.03} step={0.002} onChange={(drift) => restart({ ...knobs, drift })} />
          <div className="grid content-start gap-2">
            <label className="flex items-center gap-2"><input type="checkbox" checked={knobs.loopClosure} onChange={(e) => restart({ ...knobs, loopClosure: e.target.checked })} /> {t.loopClosure}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={knobs.camera} onChange={(e) => restart({ ...knobs, camera: e.target.checked })} /> {t.camera}</label>
            <Button size="sm" variant="outline" className="justify-self-start" disabled={seen.wrong || seen.keyframes < 40} onClick={sabotage}>{seen.wrong ? t.wronged : seen.keyframes < 40 ? t.wrongNeeds : t.wrong}</Button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Readout label={t.error} value={seen.error.toFixed(2)} unit={t.metres} large />
        <Readout label={t.wheelsOnly} value={seen.wheels.toFixed(2)} unit={t.metres} tone="alt" />
        <Readout label={t.closures} value={seen.closures} unit={t.times} tone="plain" />
        <Readout label={t.lastFix} value={seen.lastFix.toFixed(2)} unit={t.metres} tone="plain" />
      </div>
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded" style={{ background: color }} />{label}</span>;
}
