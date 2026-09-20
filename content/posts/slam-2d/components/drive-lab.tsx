"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Button } from "@/components/ui/button";
import { mulberry32 } from "@/lib/ml";
import { type Autopilot, Car, type Controls, autopilot, newAutopilot } from "./car";
import { useLabels } from "./labels";
import { DriveView } from "./drive-view3d";
import { CYAN, PINK, VIOLET } from "./paint";
import { PRESETS, type PresetId, onPreset } from "./presets";
import { type Pose, compose } from "./se2";
import { DEFAULTS, Slam } from "./slam";
import { Stick } from "./stick";
import { useVisible } from "./use-visible";
import { RING } from "./world";

const START: Pose = { x: 2, y: 2, theta: 0 };
const MAX_KEYFRAMES = 320;
/** On autopilot the first lap is fast-forwarded, then slowed down in time to watch the loop close: nobody should wait 35 s for the point of the article. */
const FAST = 4, SLOW_AGAIN_AFTER = 40; // metres driven

interface Knobs { drift: number; loopClosure: boolean; camera: boolean; wrong: boolean }
interface World { car: Car; slam: Slam; wheels: Pose[]; pilot: Autopilot; moved: boolean; driven: number; flash: number; lastFix: number; wrong: { from: number; to: number } | null }

const fresh = (k: Knobs): World => ({
  car: new Car(RING, START, mulberry32(7), k.drift),
  slam: new Slam({ ...DEFAULTS, loopClosure: k.loopClosure, candidates: k.camera ? "appearance" : "position" }),
  wheels: [], pilot: newAutopilot(), moved: true, driven: 0, flash: 0, lastFix: 0, wrong: null,
});

/**
 * Fig. 01: drive the car and watch the map it draws of a world it cannot see. Section 5's cards can hand it a setting
 * that makes it fail — no loop closure, wheels too wrong for it to notice it is back, one deliberately wrong link.
 */
export function DriveLab() {
  const t = useLabels();
  const root = useRef<HTMLDivElement>(null), stage = useRef<HTMLCanvasElement>(null), glow = useRef<HTMLDivElement>(null);
  const view = useRef<DriveView | null>(null);
  const hintId = useId();
  const visible = useVisible(root);
  const keys = useRef<Controls>({ throttle: 0, steer: 0 });
  const [auto, setAuto] = useState(false);
  const [knobs, setKnobs] = useState<Knobs>(PRESETS.healthy);
  const [preset, setPreset] = useState<PresetId>("healthy");
  const [fast, setFast] = useState(false);
  const [seen, setSeen] = useState({ error: 0, wheels: 0, closures: 0, lastFix: 0, keyframes: 0, wrong: false });
  const world = useRef<World | null>(null);

  const restart = (k: Knobs) => { world.current = fresh(k); setKnobs(k); };
  const take = (id: PresetId) => {
    setPreset(id);
    const w = world.current;
    // A wrong link is most telling on the map the reader has already built; every other setting needs a fresh start.
    if (id === "wrong" && w && knobs.loopClosure && !knobs.camera && knobs.drift === PRESETS.wrong.drift) setKnobs((k) => ({ ...k, wrong: true }));
    else restart(PRESETS[id]);
    setAuto(true);
    root.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  };
  const takeRef = useRef(take);
  useEffect(() => { takeRef.current = take; });
  useEffect(() => onPreset((id) => takeRef.current(id)), []);

  useEffect(() => {
    let cancelled = false;
    // three.js is about 170 KB the first paint does not need: fetch it once the browser is idle, not on mount.
    const start = () => void import("three").then((T) => { if (!cancelled && stage.current) view.current = new DriveView(T, stage.current, RING); });
    const idle = window.requestIdleCallback ? window.requestIdleCallback(start, { timeout: 2000 }) : window.setTimeout(start, 300);
    return () => { cancelled = true; (window.cancelIdleCallback ?? window.clearTimeout)(idle); view.current?.dispose(); view.current = null; };
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
      const speedUp = auto && w.slam.closures.length === 0 && w.driven < SLOW_AGAIN_AFTER && knobs.loopClosure ? FAST : 1;
      for (let sub = 0; sub < speedUp; sub++) {
        const controls = auto ? autopilot(w.car.truth, w.car.lastScan.ranges, w.moved, w.pilot, dt) : keys.current;
        if (!(controls.throttle || controls.steer) || w.slam.keyframes.length >= MAX_KEYFRAMES) break;
        const was = w.car.truth, odometry = w.car.step(controls, dt), before = w.slam.pose;
        const step = Math.hypot(w.car.truth.x - was.x, w.car.truth.y - was.y);
        w.moved = step > 1e-5; w.driven += step;
        if (w.slam.step(odometry, w.car.lastScan.points, w.car.lastScan.panorama)) {
          const after = w.slam.pose;
          w.lastFix = Math.hypot(after.x - before.x, after.y - before.y);
          if (w.lastFix > 0.3) w.flash = 1;
        }
        w.wheels.push(w.car.deadReckoning);
      }
      // The wrong link waits until the map is healthy, so that what it destroys is visible.
      if (knobs.wrong && !w.wrong && w.slam.closures.length >= 3) { w.wrong = w.slam.injectFalseClosure(); if (w.wrong) w.flash = 1; }
      if (auto && w.slam.keyframes.length >= MAX_KEYFRAMES) setAuto(false);
      w.flash *= 0.93;
      view.current?.render({ truth: w.car.truth, scan: w.car.lastScan.points, slam: w.slam, wheels: w.wheels, origin: START, wrong: w.wrong }, !wide.matches);
      if (glow.current) glow.current.style.opacity = String(w.flash > 0.02 ? w.flash * 0.3 : 0);
      if ((since += dt) > 0.3) {
        since = 0;
        setFast(speedUp > 1);
        const believed = compose(START, w.slam.pose), wheels = compose(START, w.car.deadReckoning), at = w.car.truth;
        setSeen({ error: Math.hypot(believed.x - at.x, believed.y - at.y), wheels: Math.hypot(wheels.x - at.x, wheels.y - at.y), closures: w.slam.closures.length, lastFix: w.lastFix, keyframes: w.slam.keyframes.length, wrong: !!w.wrong });
      }
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [auto, knobs, visible]);

  // Stick right = turn right = clockwise = negative.
  const steer = (x: number, y: number) => { keys.current = { throttle: y, steer: -x }; };
  return (
    <div ref={root} className="grid gap-4 text-sm">
      <div className="relative">
        <canvas role="img" aria-label={t.picDrive} ref={stage} className="aspect-[3/4] w-full rounded-md border border-border text-foreground sm:aspect-[2/1]" />
        <div ref={glow} className="pointer-events-none absolute right-0 bottom-0 h-[calc(50%-5px)] w-full rounded-md opacity-0 sm:h-full sm:w-[calc(50%-5px)]" style={{ background: VIOLET }} aria-hidden />
        {seen.keyframes >= MAX_KEYFRAMES && (
          <div className="absolute inset-0 grid place-items-center rounded-md bg-background/70 backdrop-blur-sm" role="status">
            <div className="grid justify-items-center gap-3 text-center">
              <p>{t.full}</p>
              <Button size="sm" onClick={() => restart({ ...knobs, wrong: PRESETS[preset].wrong })}>{t.reset}</Button>
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
            <Button size="sm" data-testid="slam-autopilot" onClick={() => setAuto((a) => !a)}>{auto ? t.stopAutopilot : t.autopilot}</Button>
            <Button size="sm" variant="ghost" onClick={() => restart(knobs)}>{t.reset}</Button>
            {fast && <span className="label self-center text-signal">{t.fastForward}</span>}
            {preset !== "healthy" && (
              <span className="flex items-center gap-2 rounded-full border border-border py-0.5 pr-1 pl-3" data-testid="slam-preset">
                <span className="label">{t.cards[preset]}</span>
                <Button size="sm" variant="ghost" onClick={() => { setPreset("healthy"); restart(PRESETS.healthy); }}>{t.backToNormal}</Button>
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div data-testid="slam-error"><Readout label={t.error} value={seen.error.toFixed(2)} unit={t.metres} large /></div>
        <Readout label={t.wheelsOnly} value={seen.wheels.toFixed(2)} unit={t.metres} tone="alt" />
        <div data-testid="slam-closures"><Readout label={t.closures} value={seen.closures} unit={t.times} tone="plain" /></div>
        <Readout label={t.lastFix} value={seen.lastFix.toFixed(2)} unit={t.metres} tone="plain" />
      </div>
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded" style={{ background: color }} />{label}</span>;
}
