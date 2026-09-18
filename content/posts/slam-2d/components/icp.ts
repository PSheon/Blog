import { type Pose, compose, transformPoints } from "./se2";

export interface Match {
  /** Pose of the source scan's frame seen from the target scan's frame. */
  pose: Pose;
  /** Root-mean-square distance from matched source points to the target's walls, metres. */
  rms: number;
  /** Fraction of source points that found a partner within the final gate. */
  inliers: number;
  iterations: number;
  /**
   * How firmly the match pins down (x, y, heading) of `pose`, as a 3×3 matrix in the target frame (row-major, per
   * unit of measurement variance). In a bare corridor it is almost zero along the corridor: the walls say
   * exactly how far you are from them and nothing about how far along you are.
   */
  information: number[];
}

/**
 * Point-to-line iterative closest point in 2-D. Repeatedly: move the source scan by the current guess, pair every
 * source point with its nearest target point, turn that target point and its neighbour in the sweep into a short
 * piece of wall, and solve a 3×3 least-squares problem for the small motion that brings the points onto the walls.
 * `target` must be in sweep order, as a scanner produces it.
 */
export function icp(target: Float64Array, source: Float64Array, guess: Pose, { maxIterations = 30, gate = 1.0, finalGate = 0.25 } = {}): Match {
  let pose = guess, rms = Infinity, inliers = 0, it = 0, information = new Array<number>(9).fill(0);
  const n = source.length / 2, m = target.length / 2;
  // Wall direction at each target point, from its neighbour in the sweep (skipped where the neighbour is a different wall).
  const nx = new Float64Array(m), ny = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    const k = (j + 1) % m, ex = target[2 * k] - target[2 * j], ey = target[2 * k + 1] - target[2 * j + 1], len = Math.hypot(ex, ey);
    if (len > 1e-6 && len < 0.6) { nx[j] = -ey / len; ny[j] = ex / len; }
  }
  for (; it < maxIterations; it++) {
    const moved = transformPoints(pose, source), limit = Math.max(finalGate, gate * 0.7 ** it), limit2 = limit * limit;
    const H = new Array<number>(9).fill(0), g = [0, 0, 0];
    let count = 0, err = 0;
    for (let i = 0; i < n; i++) {
      const px = moved[2 * i], py = moved[2 * i + 1];
      let best = limit2, at = -1;
      for (let j = 0; j < m; j++) {
        const dx = px - target[2 * j], dy = py - target[2 * j + 1], d = dx * dx + dy * dy;
        if (d < best) { best = d; at = j; }
      }
      if (at < 0 || (nx[at] === 0 && ny[at] === 0)) continue;
      const r = nx[at] * (px - target[2 * at]) + ny[at] * (py - target[2 * at + 1]);
      // A small motion (tx, ty, θ) moves the point by (tx − θ·py, ty + θ·px); its distance to the wall changes by J·(tx, ty, θ).
      const J = [nx[at], ny[at], -nx[at] * py + ny[at] * px];
      for (let a = 0; a < 3; a++) { g[a] += J[a] * r; for (let b = 0; b < 3; b++) H[a * 3 + b] += J[a] * J[b]; }
      count++; err += r * r;
    }
    if (count < 10) return { pose, rms: Infinity, inliers: 0, iterations: it, information };
    rms = Math.sqrt(err / count); inliers = count / n; information = H;
    const step = solve3(H.map((v, k) => (k % 4 === 0 ? v + 1e-6 : v)), g.map((v) => -v));
    pose = compose({ x: step[0], y: step[1], theta: step[2] }, pose);
    if (Math.hypot(step[0], step[1]) < 1e-4 && Math.abs(step[2]) < 1e-5 && limit === finalGate) { it++; break; }
  }
  return { pose, rms, inliers, iterations: it, information };
}

/** How lopsided the position part of `information` is: smallest over largest eigenvalue. Near 0 means "corridor". */
export function conditioning(information: number[]): number {
  const a = information[0], b = information[1], d = information[4], mean = (a + d) / 2, spread = Math.hypot((a - d) / 2, b);
  return mean + spread > 0 ? (mean - spread) / (mean + spread) : 0;
}

function solve3(A: number[], b: number[]): number[] {
  const M = [A.slice(0, 3).concat(b[0]), A.slice(3, 6).concat(b[1]), A.slice(6, 9).concat(b[2])];
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}
