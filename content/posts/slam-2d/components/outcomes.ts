import { mulberry32 } from "@/lib/ml";
import { Car, autopilot, newAutopilot } from "./car";
import type { Preset } from "./presets";
import { type Pose, compose, wrap } from "./se2";
import { DEFAULTS, type Keyframe, Slam } from "./slam";
import { RING } from "./world";

export const START: Pose = { x: 2, y: 2, theta: 0 };

export interface Outcome {
  keyframes: Keyframe[];
  wheels: Pose[];
  loops: [number, number][];
  wrong: { from: number; to: number } | null;
  /** Final distance between where the car believes it is and where it is, metres. */
  error: number;
  closures: number;
}

/**
 * Two laps on autopilot under one setting, without drawing anything — a couple of seconds of arithmetic, done in
 * slices so the page stays responsive. Same seed every time, so the four cards differ only in their setting.
 */
export async function simulate(preset: Preset, cancelled: () => boolean): Promise<Outcome | null> {
  const car = new Car(RING, START, mulberry32(7), preset.drift), pilot = newAutopilot(), wheels: Pose[] = [];
  const slam = new Slam({ ...DEFAULTS, loopClosure: preset.loopClosure, candidates: preset.camera ? "appearance" : "position" });
  let moved = true, swept = 0, prev = Math.atan2(START.y - 7, START.x - 10), slice = performance.now();
  for (let step = 0; swept < 4 * Math.PI && step < 40000; step++) {
    const before = car.truth, odometry = car.step(autopilot(car.truth, car.lastScan.ranges, moved, pilot, 1 / 30), 1 / 30);
    moved = Math.hypot(car.truth.x - before.x, car.truth.y - before.y) > 1e-5;
    const angle = Math.atan2(car.truth.y - 7, car.truth.x - 10);
    swept += wrap(angle - prev); prev = angle;
    slam.step(odometry, car.lastScan.points, car.lastScan.panorama);
    if (step % 6 === 0) wheels.push(car.deadReckoning);
    if (performance.now() - slice > 10) {
      await new Promise((r) => setTimeout(r));
      if (cancelled()) return null;
      slice = performance.now();
    }
  }
  const wrong = preset.wrong ? slam.injectFalseClosure() : null, believed = compose(START, slam.pose);
  return {
    keyframes: slam.keyframes, wheels, wrong, closures: slam.closures.length,
    loops: slam.edges.filter((e) => e.kind === "loop").map((e) => [e.from, e.to]),
    error: Math.hypot(believed.x - car.truth.x, believed.y - car.truth.y),
  };
}
