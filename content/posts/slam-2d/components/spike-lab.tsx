"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { mulberry32 } from "@/lib/ml";
import { Car, type Controls, autopilot } from "./car";
import { type Pose, compose, transformPoints } from "./se2";
import { DEFAULTS, Slam } from "./slam";
import { RING } from "./world";

const START: Pose = { x: 2, y: 2, theta: 0 }, ROUTE: [number, number][] = [[18, 2], [18, 12], [2, 12], [2, 2]];
const W = 440, H = 330, SCALE = 20, MAX_KEYFRAMES = 400;

interface World { car: Car; slam: Slam; ghost: Pose[]; target: number; flash: number; lastCorrection: number }

const fresh = (bias: number, loopClosure: boolean): World => ({ car: new Car(RING, START, mulberry32(7), bias), slam: new Slam({ ...DEFAULTS, loopClosure }), ghost: [], target: 0, flash: 0, lastCorrection: 0 });

/** Throwaway first version: drive (or let it drive), watch the car's own map bend, and see a loop closure snap it straight. */
export function SpikeLab() {
  const truthView = useRef<HTMLCanvasElement>(null), beliefView = useRef<HTMLCanvasElement>(null);
  const keys = useRef<Controls>({ throttle: 0, steer: 0 });
  const [auto, setAuto] = useState(false);
  const [bias, setBias] = useState(0.006);
  const [loopClosure, setLoopClosure] = useState(true);
  const [stats, setStats] = useState({ keyframes: 0, closures: 0, error: 0, deadError: 0, lastCorrection: 0, stepMs: 0 });
  const world = useRef<World | null>(null);

  const reset = (b = bias, lc = loopClosure) => { world.current = fresh(b, lc); };

  useEffect(() => {
    const press = (down: boolean) => (e: KeyboardEvent) => {
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
    if (!world.current) world.current = fresh(bias, loopClosure);
    let frame = 0, prev = performance.now(), sinceStats = 0, worst = 0;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const w = world.current!, dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      let controls = keys.current;
      if (auto) { const a = autopilot(w.car.truth, ROUTE, w.target); controls = a.controls; w.target = a.target; }
      if ((controls.throttle || controls.steer) && w.slam.keyframes.length < MAX_KEYFRAMES) {
        const odometry = w.car.step(controls, dt), t0 = performance.now();
        const before = w.slam.pose, closure = w.slam.step(odometry, w.car.lastScan.points, w.car.lastScan.panorama);
        worst = Math.max(worst, performance.now() - t0);
        if (closure) { const after = w.slam.pose; w.lastCorrection = Math.hypot(after.x - before.x, after.y - before.y); if (w.lastCorrection > 0.3) w.flash = 1; }
        w.ghost.push(w.car.deadReckoning);
      }
      w.flash *= 0.93;
      drawTruth(truthView.current, w);
      drawBelief(beliefView.current, w);
      if ((sinceStats += dt) > 0.4) {
        sinceStats = 0;
        const origin = { x: START.x, y: START.y, theta: START.theta }, believed = compose(origin, w.slam.pose), dead = compose(origin, w.car.deadReckoning);
        setStats({ keyframes: w.slam.keyframes.length, closures: w.slam.closures.length, error: Math.hypot(believed.x - w.car.truth.x, believed.y - w.car.truth.y), deadError: Math.hypot(dead.x - w.car.truth.x, dead.y - w.car.truth.y), lastCorrection: w.lastCorrection, stepMs: worst });
      }
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [auto, bias, loopClosure]);

  const press = (c: Partial<Controls>) => Object.assign(keys.current, c);
  const release = () => Object.assign(keys.current, { throttle: 0, steer: 0 });
  return (
    <div className="grid gap-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <figure className="grid gap-1">
          <canvas ref={truthView} width={W} height={H} className="w-full rounded-md border border-border" aria-label="The real world" />
          <figcaption className="text-muted-foreground">the real world (the car never sees this)</figcaption>
        </figure>
        <figure className="grid gap-1">
          <canvas ref={beliefView} width={W} height={H} className="w-full rounded-md border border-border" aria-label="The car's own map" />
          <figcaption className="text-muted-foreground">what the car believes · pink = odometer alone</figcaption>
        </figure>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setAuto((a) => !a)}>{auto ? "Stop autopilot" : "Autopilot"}</Button>
        <HoldButton label="←" onPress={() => press({ steer: 1 })} onRelease={release} />
        <HoldButton label="↑" onPress={() => press({ throttle: 1 })} onRelease={release} />
        <HoldButton label="↓" onPress={() => press({ throttle: -1 })} onRelease={release} />
        <HoldButton label="→" onPress={() => press({ steer: -1 })} onRelease={release} />
        <Button size="sm" variant="outline" onClick={() => reset()}>reset</Button>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={loopClosure} onChange={(e) => { setLoopClosure(e.target.checked); reset(bias, e.target.checked); }} /> loop closure
        </label>
        <label className="flex items-center gap-2">
          drift {bias.toFixed(3)} rad/m
          <input type="range" min={0} max={0.025} step={0.001} value={bias} onChange={(e) => { const b = Number(e.target.value); setBias(b); reset(b); }} />
        </label>
      </div>
      <p className="tabular text-muted-foreground" data-testid="slam-stats">
        {stats.keyframes} keyframes · {stats.closures} loop closures · position error {stats.error.toFixed(2)} m (odometer alone {stats.deadError.toFixed(2)} m) · last correction {stats.lastCorrection.toFixed(2)} m · slowest step {stats.stepMs.toFixed(0)} ms
      </p>
    </div>
  );
}

/** A button that acts for as long as it is held, for driving on a touch screen. */
function HoldButton({ label, onPress, onRelease }: { label: string; onPress: () => void; onRelease: () => void }) {
  return (
    <Button size="sm" variant="outline" onPointerDown={onPress} onPointerUp={onRelease} onPointerLeave={onRelease} onPointerCancel={onRelease}>
      {label}
    </Button>
  );
}

const px = (x: number) => 20 + x * SCALE, py = (y: number) => H - 25 - y * SCALE;

function drawTruth(canvas: HTMLCanvasElement | null, w: World) {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  const ink = getComputedStyle(canvas).color, t = w.car.truth;
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = "#79dafa"; ctx.globalAlpha = 0.18; ctx.lineWidth = 1;
  const hits = transformPoints(t, w.car.lastScan.points);
  for (let i = 0; i < hits.length; i += 2) { ctx.beginPath(); ctx.moveTo(px(t.x), py(t.y)); ctx.lineTo(px(hits[i]), py(hits[i + 1])); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.strokeStyle = ink; ctx.lineWidth = 2;
  for (const [x0, y0, x1, y1] of RING) { ctx.beginPath(); ctx.moveTo(px(x0), py(y0)); ctx.lineTo(px(x1), py(y1)); ctx.stroke(); }
  drawCar(ctx, t, "#79dafa");
}

function drawBelief(canvas: HTMLCanvasElement | null, w: World) {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  const ink = getComputedStyle(canvas).color, origin = START;
  ctx.clearRect(0, 0, W, H);
  if (w.flash > 0.02) { ctx.fillStyle = "#b9a5ff"; ctx.globalAlpha = w.flash * 0.25; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  // The map: every keyframe's scan, drawn where SLAM currently believes that keyframe was.
  ctx.fillStyle = ink; ctx.globalAlpha = 0.55;
  for (const k of w.slam.keyframes) {
    const pts = transformPoints(compose(origin, k.pose), k.points);
    for (let i = 0; i < pts.length; i += 2) ctx.fillRect(px(pts[i]) - 0.75, py(pts[i + 1]) - 0.75, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
  const path = (poses: Pose[], color: string, width: number) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
    poses.forEach((p, i) => { const q = compose(origin, p); if (i) ctx.lineTo(px(q.x), py(q.y)); else ctx.moveTo(px(q.x), py(q.y)); });
    ctx.stroke();
  };
  path(w.ghost.filter((_, i) => i % 5 === 0), "#ff6e96", 1.5);
  path(w.slam.keyframes.map((k) => k.pose), "#79dafa", 2);
  ctx.strokeStyle = "#b9a5ff"; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
  for (const e of w.slam.edges) {
    if (e.kind !== "loop") continue;
    const a = compose(origin, w.slam.keyframes[e.from].pose), b = compose(origin, w.slam.keyframes[e.to].pose);
    ctx.beginPath(); ctx.moveTo(px(a.x), py(a.y)); ctx.lineTo(px(b.x), py(b.y)); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  drawCar(ctx, compose(origin, w.slam.pose), "#79dafa");
}

function drawCar(ctx: CanvasRenderingContext2D, p: Pose, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(px(p.x), py(p.y), 6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(px(p.x), py(p.y)); ctx.lineTo(px(p.x + Math.cos(p.theta) * 0.7), py(p.y + Math.sin(p.theta) * 0.7)); ctx.stroke();
}
