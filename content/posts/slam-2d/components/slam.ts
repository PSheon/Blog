import { type Edge, diagonal, icpInformation, optimise } from "./graph";
import { conditioning, icp } from "./icp";
import { resemblance } from "./place";
import { type Pose, between, compose } from "./se2";

export interface Keyframe {
  pose: Pose;
  /** Scan points in the car's own frame at that moment. */
  points: Float64Array;
  /** What the panoramic camera saw there, if the car has one. */
  panorama?: Float64Array;
}

export interface SlamOptions {
  /** Take a new keyframe after this much travel (m) or turning (rad). */
  everyMetres: number;
  everyRadians: number;
  /** Refine each odometry step by matching consecutive scans. */
  scanMatchOdometry: boolean;
  /** Look for places seen before, and correct the whole path when one is recognised. */
  loopClosure: boolean;
  /**
   * How old places are proposed. "position": whatever the current estimate says is nearby — cheap, but blind once
   * the estimate has drifted further than `searchRadius`. "appearance": whatever looks like the current camera view,
   * wherever the estimate thinks it is.
   */
  candidates: "position" | "appearance";
  /** Appearance only: how alike two panoramas must look (normalised correlation) to be worth a scan match. */
  minResemblance: number;
  /** How close (m, by the current estimate) an old keyframe must be to be tried, and how many keyframes back it must be. */
  searchRadius: number;
  minGap: number;
  /** A match is believed only if this share of points line up, this tightly (m). */
  minInliers: number;
  maxRms: number;
  /** …and only if the scans pin the position down in every direction (see `conditioning`); a bare corridor does not. */
  minConditioning: number;
}

export const DEFAULTS: SlamOptions = { everyMetres: 0.5, everyRadians: 0.35, scanMatchOdometry: false, loopClosure: true, candidates: "position", minResemblance: 0.8, searchRadius: 2.5, minGap: 25, minInliers: 0.9, maxRms: 0.04, minConditioning: 0.15 };

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
  step(odometry: Pose, points: Float64Array, panorama?: Float64Array): Closure | null {
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
      this.keyframes.push({ pose: compose(prev.pose, z), points, panorama });
    } else {
      this.keyframes.push({ pose: { x: 0, y: 0, theta: 0 }, points, panorama });
    }
    this.since = { x: 0, y: 0, theta: 0 };
    this.travelled = this.turned = 0;
    return o.loopClosure ? this.tryClosure(index) : null;
  }

  /**
   * Make the mistake a real system dreads: declare that two keyframes far apart are the same spot, facing opposite
   * ways, and re-optimise. Returns the pair it chose, or null if the path is still too short to have one.
   */
  injectFalseClosure(): { from: number; to: number } | null {
    const n = this.keyframes.length;
    let pick: { from: number; to: number; d: number } | null = null;
    for (let i = 0; i < n; i += 3)
      for (let j = i + 10; j < n; j += 3) {
        const d = Math.hypot(this.keyframes[i].pose.x - this.keyframes[j].pose.x, this.keyframes[i].pose.y - this.keyframes[j].pose.y);
        if (d > 6 && (!pick || d > pick.d)) pick = { from: i, to: j, d };
      }
    if (!pick) return null;
    this.edges.push({ from: pick.from, to: pick.to, z: { x: 0, y: 0, theta: Math.PI }, information: diagonal(2500, 2500, 10000), kind: "loop" });
    optimise(this.keyframes.map((k) => k.pose), this.edges, 15);
    return pick;
  }

  private tryClosure(index: number): Closure | null {
    const o = this.options, here = this.keyframes[index];
    let best: { at: number; z: Pose; rms: number; information: number[] } | null = null;
    for (let k = 0; k < index - o.minGap; k++) {
      const old = this.keyframes[k];
      let guess: Pose;
      if (o.candidates === "appearance" && here.panorama && old.panorama) {
        const look = resemblance(old.panorama, here.panorama);
        if (look.score < o.minResemblance) continue;
        guess = { x: 0, y: 0, theta: look.heading }; // same view ⇒ about the same spot; the picture's shift gives the heading
      } else {
        if (Math.hypot(old.pose.x - here.pose.x, old.pose.y - here.pose.y) > o.searchRadius) continue;
        guess = between(old.pose, here.pose);
      }
      const m = icp(old.points, here.points, guess, { gate: 1.5 });
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
