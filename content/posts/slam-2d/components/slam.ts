import { type Edge, diagonal, icpInformation, optimise } from "./graph";
import { conditioning, icp } from "./icp";
import { type Pose, between, compose } from "./se2";

export interface Keyframe {
  pose: Pose;
  /** Scan points in the car's own frame at that moment. */
  points: Float64Array;
}

export interface SlamOptions {
  /** Take a new keyframe after this much travel (m) or turning (rad). */
  everyMetres: number;
  everyRadians: number;
  /** Refine each odometry step by matching consecutive scans. */
  scanMatchOdometry: boolean;
  /** Look for places seen before, and correct the whole path when one is recognised. */
  loopClosure: boolean;
  /** How close (m, by the current estimate) an old keyframe must be to be tried, and how many keyframes back it must be. */
  searchRadius: number;
  minGap: number;
  /** A match is believed only if this share of points line up, this tightly (m). */
  minInliers: number;
  maxRms: number;
  /** …and only if the scans pin the position down in every direction (see `conditioning`); a bare corridor does not. */
  minConditioning: number;
}

export const DEFAULTS: SlamOptions = { everyMetres: 0.5, everyRadians: 0.35, scanMatchOdometry: false, loopClosure: true, searchRadius: 2.5, minGap: 25, minInliers: 0.9, maxRms: 0.04, minConditioning: 0.15 };

export interface Closure { from: number; to: number; passes: number; errorBefore: number; errorAfter: number }

/** Pose-graph SLAM: keyframes joined by odometry edges, plus loop edges whenever an old place is recognised by scan matching. */
export class Slam {
  readonly keyframes: Keyframe[] = [];
  readonly edges: Edge[] = [];
  readonly closures: Closure[] = [];
  /** Motion accumulated from odometry since the last keyframe. */
  private since: Pose = { x: 0, y: 0, theta: 0 };
  private travelled = 0;
  private turned = 0;

  constructor(readonly options: SlamOptions = DEFAULTS) {}

  /** Where SLAM thinks the car is right now. */
  get pose(): Pose {
    const last = this.keyframes[this.keyframes.length - 1];
    return last ? compose(last.pose, this.since) : this.since;
  }

  /** Feed one odometry increment (motion since the previous call, in the car's frame) and the scan taken after it. */
  step(odometry: Pose, points: Float64Array): Closure | null {
    this.since = compose(this.since, odometry);
    this.travelled += Math.hypot(odometry.x, odometry.y);
    this.turned += Math.abs(odometry.theta);
    const o = this.options;
    if (this.keyframes.length && this.travelled < o.everyMetres && this.turned < o.everyRadians) return null;

    const index = this.keyframes.length, prev = this.keyframes[index - 1];
    if (prev) {
      let z = this.since;
      if (o.scanMatchOdometry) {
        const m = icp(prev.points, points, z, { gate: 0.5 });
        if (m.inliers > 0.7 && m.rms < 0.08) z = m.pose;
      }
      this.edges.push({ from: index - 1, to: index, z, information: diagonal(100, 100, 400), kind: "odometry" });
      this.keyframes.push({ pose: compose(prev.pose, z), points });
    } else {
      this.keyframes.push({ pose: { x: 0, y: 0, theta: 0 }, points });
    }
    this.since = { x: 0, y: 0, theta: 0 };
    this.travelled = this.turned = 0;
    return o.loopClosure ? this.tryClosure(index) : null;
  }

  private tryClosure(index: number): Closure | null {
    const o = this.options, here = this.keyframes[index];
    let best: { at: number; z: Pose; rms: number; information: number[] } | null = null;
    for (let k = 0; k < index - o.minGap; k++) {
      const old = this.keyframes[k];
      if (Math.hypot(old.pose.x - here.pose.x, old.pose.y - here.pose.y) > o.searchRadius) continue;
      const m = icp(old.points, here.points, between(old.pose, here.pose), { gate: 1.5 });
      if (m.inliers >= o.minInliers && m.rms <= o.maxRms && conditioning(m.information) >= o.minConditioning && (!best || m.rms < best.rms)) best = { at: k, z: m.pose, rms: m.rms, information: m.information };
    }
    if (!best) return null;
    // 1/σ² for a 5 cm point error, divided by ten because neighbouring beams hit the same wall and are far from independent.
    this.edges.push({ from: best.at, to: index, z: best.z, information: icpInformation(best.information, best.z, 40), kind: "loop" });
    const poses = this.keyframes.map((k) => k.pose);
    const history = optimise(poses, this.edges);
    const closure = { from: best.at, to: index, passes: history.length - 1, errorBefore: history[0], errorAfter: history[history.length - 1] };
    this.closures.push(closure);
    return closure;
  }
}
