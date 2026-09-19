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

/** A driver that follows the ring, for readers who would rather watch. */
export function autopilot(truth: Pose, route: [number, number][], target: number): { controls: Controls; target: number } {
  const [tx, ty] = route[target], err = wrap(Math.atan2(ty - truth.y, tx - truth.x) - truth.theta);
  const next = Math.hypot(tx - truth.x, ty - truth.y) < 0.6 ? (target + 1) % route.length : target;
  return { controls: { throttle: Math.abs(err) > 0.5 ? 0.15 : 1, steer: Math.max(-1, Math.min(1, err * 2)) }, target: next };
}
