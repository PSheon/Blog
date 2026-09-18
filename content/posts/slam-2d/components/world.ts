import type { Rng } from "@/lib/ml";
import type { Pose } from "./se2";

/** Walls as line segments [x0, y0, x1, y1], in metres. */
export type Segment = [number, number, number, number];

const rect = (x0: number, y0: number, x1: number, y1: number): Segment[] => [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];

/**
 * A ring corridor: an outer wall, an inner block, and clutter along the way. The clutter matters — in a bare
 * corridor every scan looks like two parallel lines and nothing says how far along it you are.
 */
export const RING: Segment[] = [
  ...rect(0, 0, 20, 14),
  ...rect(4, 4, 16, 10),
  ...rect(7, 0, 8, 1.2), ...rect(13, 2.8, 14, 4), ...rect(18.6, 5, 20, 6.5), ...rect(16, 8, 17, 9),
  ...rect(11, 12.6, 12.5, 14), ...rect(5.5, 10, 6.5, 11.2), ...rect(0, 7.5, 1.3, 8.5), ...rect(2.8, 3, 4, 4),
];

export interface Scan {
  /** Range per beam in metres; Infinity when nothing was hit within range. */
  ranges: Float64Array;
  /** Hit points in the car's own frame, x0 y0 x1 y1 …, misses left out. */
  points: Float64Array;
}

export const BEAMS = 180, MAX_RANGE = 8;

/** A 360° range scanner with Gaussian range noise (metres). */
export function scan(world: Segment[], pose: Pose, rng: Rng, noise = 0.02): Scan {
  const ranges = new Float64Array(BEAMS), pts: number[] = [];
  for (let k = 0; k < BEAMS; k++) {
    const a = (k / BEAMS) * 2 * Math.PI, dx = Math.cos(pose.theta + a), dy = Math.sin(pose.theta + a);
    let best = Infinity;
    for (const [x0, y0, x1, y1] of world) {
      const ex = x1 - x0, ey = y1 - y0, det = ex * dy - ey * dx;
      if (Math.abs(det) < 1e-12) continue;
      const t = (ex * (y0 - pose.y) - ey * (x0 - pose.x)) / det, u = (dx * (y0 - pose.y) - dy * (x0 - pose.x)) / det;
      if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
    }
    if (best > MAX_RANGE) { ranges[k] = Infinity; continue; }
    const r = best + gaussian(rng) * noise;
    ranges[k] = r;
    pts.push(r * Math.cos(a), r * Math.sin(a));
  }
  return { ranges, points: Float64Array.from(pts) };
}

export function gaussian(rng: Rng): number {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}
