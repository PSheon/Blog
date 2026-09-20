import type { Rng } from "@/lib/ml";
import { type Pose, compose, wrap } from "./se2";
import { type Scan, type Segment, gaussian, scan } from "./world";

export interface Controls {
  /** −1…1: reverse…forward, and right…left. */
  throttle: number;
  steer: number;
}

const SPEED = 1.6, TURN = 1.8, RADIUS = 0.28;

/** The real car in the real world, plus what its sensors report: a drifting odometer and a range scanner. */
export class Car {
  truth: Pose;
  /** Where you would think you are if you only ever added up the odometer. */
  deadReckoning: Pose = { x: 0, y: 0, theta: 0 };
  lastScan: Scan;

  constructor(
    private readonly world: Segment[],
    start: Pose,
    private readonly rng: Rng,
    /** Steady pull to one side, rad per metre — what unequal wheels do. */
    public bias = 0.006,
  ) {
    this.truth = start;
    this.lastScan = scan(world, start, rng);
  }

  /** Advance by dt seconds. Returns the odometer's version of the motion. */
  step(controls: Controls, dt: number): Pose {
    const v = controls.throttle * SPEED * dt, w = controls.steer * TURN * dt;
    const next = compose(this.truth, { x: v, y: 0, theta: w });
    const moved = this.blocked(next) ? { x: 0, y: 0, theta: w } : { x: v, y: 0, theta: w };
    this.truth = compose(this.truth, moved);
    const d = Math.abs(moved.x);
    const odometry: Pose = { x: moved.x * (1 + 0.02 * gaussian(this.rng)), y: 0.02 * d * gaussian(this.rng), theta: wrap(moved.theta + this.bias * d + 0.03 * Math.sqrt(d) * 0.1 * gaussian(this.rng)) };
    this.deadReckoning = compose(this.deadReckoning, odometry);
    this.lastScan = scan(this.world, this.truth, this.rng);
    return odometry;
  }

  private blocked(p: Pose): boolean {
    for (const [x0, y0, x1, y1] of this.world) {
      const ex = x1 - x0, ey = y1 - y0, t = Math.max(0, Math.min(1, ((p.x - x0) * ex + (p.y - y0) * ey) / (ex * ex + ey * ey)));
      if (Math.hypot(p.x - (x0 + t * ex), p.y - (y0 + t * ey)) < RADIUS) return true;
    }
    return false;
  }
}

/** The corridor's centre line, anticlockwise, one point per metre. */
export const CENTRE_LINE: [number, number][] = (() => {
  const corners: [number, number][] = [[2, 2], [18, 2], [18, 12], [2, 12]], out: [number, number][] = [];
  corners.forEach(([x0, y0], i) => {
    const [x1, y1] = corners[(i + 1) % 4], n = Math.round(Math.hypot(x1 - x0, y1 - y0));
    for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  });
  return out;
})();

export interface Autopilot {
  /** Seconds left of backing away from whatever it ran into. */
  reversing: number;
  /** Seconds it has been pushing without moving. */
  pushing: number;
  /** Which way to turn while reversing. */
  swing: number;
}
export const newAutopilot = (): Autopilot => ({ reversing: 0, pushing: 0, swing: 1 });

const LOOKAHEAD = 3, SLOW = 1.0, STOP = 0.45;

/**
 * A driver for readers who would rather watch. It knows the corridor's centre line and where the car really is
 * (it is the driver, not the robot), and it looks at the same range scan the robot gets:
 *  1. aim at the centre line a few metres ahead of the nearest point on it — wherever the car happens to be;
 *  2. if something is close in front, slow down and steer towards the side with more room;
 *  3. if it has been pushing against something for a while, back off while turning, then carry on.
 * The first version only knew four corners and drove at the next one in a straight line; engaged anywhere but the
 * start line, that line usually went through a wall.
 */
export function autopilot(truth: Pose, ranges: Float64Array, moved: boolean, state: Autopilot, dt: number): Controls {
  const beams = ranges.length, sector = (from: number, to: number) => { let m = Infinity; for (let d = from; d <= to; d++) m = Math.min(m, ranges[(((Math.round((d / 360) * beams)) % beams) + beams) % beams]); return m; };
  const ahead = sector(-25, 25), left = sector(20, 80), right = sector(-80, -20);
  if (state.reversing > 0) { state.reversing -= dt; return { throttle: -0.6, steer: -state.swing }; }
  state.pushing = moved ? 0 : state.pushing + dt;
  if (state.pushing > 0.4) { state.pushing = 0; state.reversing = 0.9; state.swing = left > right ? 1 : -1; return { throttle: -0.6, steer: -state.swing }; }

  let nearest = 0, best = Infinity;
  CENTRE_LINE.forEach(([x, y], i) => { const d = Math.hypot(x - truth.x, y - truth.y); if (d < best) { best = d; nearest = i; } });
  const [tx, ty] = CENTRE_LINE[(nearest + LOOKAHEAD) % CENTRE_LINE.length], err = wrap(Math.atan2(ty - truth.y, tx - truth.x) - truth.theta);
  let steer = Math.max(-1, Math.min(1, err * 2)), throttle = Math.abs(err) > 0.9 ? 0 : Math.abs(err) > 0.5 ? 0.35 : 1;
  if (ahead < SLOW) {
    // Something close in front: turn towards the roomier side, harder the closer it is, and creep.
    const push = (SLOW - ahead) / (SLOW - STOP);
    steer = Math.max(-1, Math.min(1, steer + (left > right ? 1 : -1) * push * 1.5));
    throttle = ahead < STOP ? 0 : Math.min(throttle, 0.4);
    if (ahead < STOP && Math.abs(steer) < 0.3) steer = left > right ? 1 : -1;
  }
  return { throttle, steer };
}

/** Drive `laps` times round the ring on autopilot from `start`, calling `each` after every step. For the figures that replay a fixed drive. */
export function driveLaps(car: Car, laps: number, each: (odometry: Pose, step: number) => void, dt = 1 / 30) {
  const pilot = newAutopilot();
  let moved = true, swept = 0, prev = Math.atan2(car.truth.y - 7, car.truth.x - 10);
  for (let step = 0; swept < laps * 2 * Math.PI && step < 40000; step++) {
    const before = car.truth, odometry = car.step(autopilot(car.truth, car.lastScan.ranges, moved, pilot, dt), dt);
    moved = Math.hypot(car.truth.x - before.x, car.truth.y - before.y) > 1e-5;
    const angle = Math.atan2(car.truth.y - 7, car.truth.x - 10);
    swept += wrap(angle - prev); prev = angle;
    each(odometry, step);
  }
}

/**
 * The same drive as `driveLaps`, but in slices of a few milliseconds with the event loop in between. A lap costs
 * about 270 ms of lidar sweeps; run in one go during hydration, the two replay figures froze the page for 0.8 s
 * (3.4 s of blocking time under Lighthouse's phone throttling). Resolves to false if `cancelled()` turned true.
 */
export async function driveLapsSliced(car: Car, laps: number, each: (odometry: Pose, step: number) => void, cancelled: () => boolean, dt = 1 / 30): Promise<boolean> {
  const pilot = newAutopilot();
  let moved = true, swept = 0, prev = Math.atan2(car.truth.y - 7, car.truth.x - 10), sliceStart = performance.now();
  for (let step = 0; swept < laps * 2 * Math.PI && step < 40000; step++) {
    const before = car.truth, odometry = car.step(autopilot(car.truth, car.lastScan.ranges, moved, pilot, dt), dt);
    moved = Math.hypot(car.truth.x - before.x, car.truth.y - before.y) > 1e-5;
    const angle = Math.atan2(car.truth.y - 7, car.truth.x - 10);
    swept += wrap(angle - prev); prev = angle;
    each(odometry, step);
    if (performance.now() - sliceStart > 6) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (cancelled()) return false;
      sliceStart = performance.now();
    }
  }
  return !cancelled();
}
