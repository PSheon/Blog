"use client";

import { useEffect, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Button } from "@/components/ui/button";
import { mulberry32 } from "@/lib/ml";
import { Car, type Controls, autopilot } from "./car";
import { useLabels } from "./labels";
import { CYAN, PINK, VIOLET, X, Y, car as drawCar, dots, path, prepare, ringView, walls } from "./paint";
import { Param } from "./param";
import { type Pose, compose } from "./se2";
import { DEFAULTS, Slam } from "./slam";
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
  const root = useRef<HTMLDivElement>(null), realView = useRef<HTMLCanvasElement>(null), mapView = useRef<HTMLCanvasElement>(null);
  const visible = useVisible(root);
  const keys = useRef<Controls>({ throttle: 0, steer: 0 }), focused = useRef(false);
  const [auto, setAuto] = useState(false);
  const [knobs, setKnobs] = useState<Knobs>({ drift: 0.006, loopClosure: true, camera: false });
  const [seen, setSeen] = useState({ error: 0, wheels: 0, closures: 0, lastFix: 0, keyframes: 0, wrong: false });
  const world = useRef<World | null>(null);

  const restart = (k: Knobs) => { world.current = fresh(k); setKnobs(k); };

  useEffect(() => {
    const press = (down: boolean) => (e: KeyboardEvent) => {
      if (!focused.current) return;
      const k = keys.current;
      if (e.key === "ArrowUp") k.throttle = down ? 1 : 0;
      else if (e.key === "ArrowDown") k.throttle = down ? -1 : 0;
      else if (e.key === "ArrowLeft") k.steer = down ? 1 : 0;
      else if (e.key === "ArrowRight") k.steer = down ? -1 : 0;
      else return;
      e.preventDefault();
    };
    const down = press(true), up = press(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  useEffect(() => {
    if (!world.current) world.current = fresh(knobs);
    let frame = 0, prev = performance.now(), since = 0;
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
      w.flash *= 0.93;
      paintReal(realView.current, w);
      paintMap(mapView.current, w);
      if ((since += dt) > 0.3) {
        since = 0;
        const believed = compose(START, w.slam.pose), wheels = compose(START, w.car.deadReckoning), at = w.car.truth;
        setSeen({ error: Math.hypot(believed.x - at.x, believed.y - at.y), wheels: Math.hypot(wheels.x - at.x, wheels.y - at.y), closures: w.slam.closures.length, lastFix: w.lastFix, keyframes: w.slam.keyframes.length, wrong: !!w.wrong });
      }
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [auto, knobs, visible]);

  const press = (c: Partial<Controls>) => Object.assign(keys.current, c);
  const release = () => Object.assign(keys.current, { throttle: 0, steer: 0 });
  const sabotage = () => {
    const w = world.current;
    if (!w || w.wrong) return;
    w.wrong = w.slam.injectFalseClosure();
    if (w.wrong) w.flash = 1;
  };

  return (
    <div ref={root} className="grid gap-4 text-sm" tabIndex={0} onFocus={() => (focused.current = true)} onBlur={() => { focused.current = false; release(); }} onPointerDown={() => (focused.current = true)} aria-label={t.driveHint}>
      <div className="grid gap-3 sm:grid-cols-2">
        <figure className="grid gap-1.5">
          <canvas ref={realView} className="aspect-[4/3] w-full rounded-md border border-border text-foreground" />
          <figcaption className="label">{t.real}</figcaption>
        </figure>
        <figure className="grid gap-1.5">
          <canvas ref={mapView} className="aspect-[4/3] w-full rounded-md border border-border text-foreground" />
          <figcaption className="label">{t.believed}</figcaption>
        </figure>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
        <Swatch color={CYAN} label={t.legendSlam} /> <Swatch color={PINK} label={t.legendWheels} /> <Swatch color={VIOLET} label={t.legendLoop} />
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setAuto((a) => !a)}>{auto ? t.stopAutopilot : t.autopilot}</Button>
        <HoldButton label="←" name={t.left} onPress={() => press({ steer: 1 })} onRelease={release} />
        <HoldButton label="↑" name={t.forward} onPress={() => press({ throttle: 1 })} onRelease={release} />
        <HoldButton label="↓" name={t.back} onPress={() => press({ throttle: -1 })} onRelease={release} />
        <HoldButton label="→" name={t.right} onPress={() => press({ steer: -1 })} onRelease={release} />
        <Button size="sm" variant="ghost" onClick={() => restart(knobs)}>{t.reset}</Button>
        <span className="text-muted-foreground">{seen.keyframes >= MAX_KEYFRAMES ? t.full : t.driveHint}</span>
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

/** A button that acts for as long as it is held, for driving on a touch screen. */
function HoldButton({ label, name, onPress, onRelease }: { label: string; name: string; onPress: () => void; onRelease: () => void }) {
  return (
    <Button size="sm" variant="outline" aria-label={name} className="touch-none select-none" onPointerDown={onPress} onPointerUp={onRelease} onPointerLeave={onRelease} onPointerCancel={onRelease}>
      {label}
    </Button>
  );
}

function paintReal(canvas: HTMLCanvasElement | null, w: World) {
  const p = prepare(canvas);
  if (!p) return;
  const { ctx, ink } = p, v = ringView(p.w, p.h), at = w.car.truth, pts = w.car.lastScan.points, c = Math.cos(at.theta), s = Math.sin(at.theta);
  ctx.strokeStyle = CYAN; ctx.globalAlpha = 0.16; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 0; i < pts.length; i += 2) { ctx.moveTo(X(v, at.x), Y(v, at.y)); ctx.lineTo(X(v, at.x + c * pts[i] - s * pts[i + 1]), Y(v, at.y + s * pts[i] + c * pts[i + 1])); }
  ctx.stroke(); ctx.globalAlpha = 1;
  walls(ctx, v, RING, ink);
  drawCar(ctx, v, at, CYAN);
}

function paintMap(canvas: HTMLCanvasElement | null, w: World) {
  const p = prepare(canvas);
  if (!p) return;
  const { ctx, ink } = p, v = ringView(p.w, p.h);
  if (w.flash > 0.02) { ctx.fillStyle = VIOLET; ctx.globalAlpha = w.flash * 0.22; ctx.fillRect(0, 0, p.w, p.h); ctx.globalAlpha = 1; }
  // The map is nothing more than every remembered scan, drawn where the car currently believes it was taken.
  for (const k of w.slam.keyframes) dots(ctx, v, compose(START, k.pose), k.points, ink, 0.5);
  path(ctx, v, w.wheels.filter((_, i) => i % 5 === 0), PINK, 1.5, START);
  path(ctx, v, w.slam.keyframes.map((k) => k.pose), CYAN, 2, START);
  ctx.lineWidth = 1;
  for (const e of w.slam.edges) {
    if (e.kind !== "loop") continue;
    const a = compose(START, w.slam.keyframes[e.from].pose), b = compose(START, w.slam.keyframes[e.to].pose), bad = w.wrong && e.from === w.wrong.from && e.to === w.wrong.to;
    ctx.strokeStyle = bad ? PINK : VIOLET; ctx.globalAlpha = bad ? 1 : 0.45; ctx.lineWidth = bad ? 2.5 : 1;
    ctx.beginPath(); ctx.moveTo(X(v, a.x), Y(v, a.y)); ctx.lineTo(X(v, b.x), Y(v, b.y)); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  drawCar(ctx, v, compose(START, w.slam.pose), CYAN);
}
