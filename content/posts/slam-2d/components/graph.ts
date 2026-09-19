import { type Pose, wrap } from "./se2";

export interface Edge {
  from: number;
  to: number;
  /** Measured motion from node `from` to node `to`, seen from `from`. */
  z: Pose;
  /** How much to trust it: a 3×3 information matrix (inverse covariance, row-major) over the x, y and heading errors. */
  information: number[];
  kind: "odometry" | "loop";
}

/** Sum of weighted squared disagreements between the poses and the measurements. */
export function graphError(poses: Pose[], edges: Edge[]): number {
  let total = 0;
  for (const e of edges) {
    const [ex, ey, et] = residual(poses[e.from], poses[e.to], e.z);
    const r = [ex, ey, et];
    for (let u = 0; u < 3; u++) for (let v = 0; v < 3; v++) total += r[u] * e.information[u * 3 + v] * r[v];
  }
  return total;
}

function residual(a: Pose, b: Pose, z: Pose): [number, number, number] {
  const c = Math.cos(a.theta), s = Math.sin(a.theta), dx = b.x - a.x, dy = b.y - a.y;
  const px = c * dx + s * dy - z.x, py = -s * dx + c * dy - z.y, cz = Math.cos(z.theta), sz = Math.sin(z.theta);
  return [cz * px + sz * py, -sz * px + cz * py, wrap(b.theta - a.theta - z.theta)];
}

/**
 * Gauss–Newton on the pose graph (Grisetti et al. 2010). Each pass linearises every edge around the current
 * poses, adds its contribution to one big system H·Δ = −b, solves it, and moves all poses at once. Node 0 is pinned.
 * Returns the error after each pass.
 */
export function optimise(poses: Pose[], edges: Edge[], passes = 8): number[] {
  const n = poses.length * 3, history: number[] = [graphError(poses, edges)];
  for (let pass = 0; pass < passes; pass++) {
    const H = new Float64Array(n * n), b = new Float64Array(n);
    for (const e of edges) {
      const a = poses[e.from], p = poses[e.to], r = residual(a, p, e.z);
      const c = Math.cos(a.theta), s = Math.sin(a.theta), cz = Math.cos(e.z.theta), sz = Math.sin(e.z.theta), dx = p.x - a.x, dy = p.y - a.y;
      // Rzᵀ·Raᵀ and Rzᵀ·(dRaᵀ/dθ)·(tb − ta)
      const m00 = cz * c - sz * s, m01 = cz * s + sz * c, m10 = -sz * c - cz * s, m11 = -sz * s + cz * c;
      const qx = -s * dx + c * dy, qy = -c * dx - s * dy, d0 = cz * qx + sz * qy, d1 = -sz * qx + cz * qy;
      const A = [[-m00, -m01, d0], [-m10, -m11, d1], [0, 0, -1]], B = [[m00, m01, 0], [m10, m11, 0], [0, 0, 1]];
      const blocks: [number, number[][]][] = [[e.from * 3, A], [e.to * 3, B]];
      for (const [ri, Ji] of blocks) {
        for (let u = 0; u < 3; u++) {
          let g = 0;
          for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) g += Ji[k][u] * e.information[k * 3 + l] * r[l];
          b[ri + u] += g;
        }
        for (const [rj, Jj] of blocks)
          for (let u = 0; u < 3; u++)
            for (let v = 0; v < 3; v++) {
              let h = 0;
              for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) h += Ji[k][u] * e.information[k * 3 + l] * Jj[l][v];
              H[(ri + u) * n + rj + v] += h;
            }
      }
    }
    for (let k = 0; k < 3; k++) H[k * n + k] += 1e9; // pin the first pose: without it the whole map is free to float
    for (let k = 0; k < n; k++) H[k * n + k] += 1e-9;
    const delta = solveCholesky(H, b, n);
    poses.forEach((p, i) => {
      p.x -= delta[3 * i]; p.y -= delta[3 * i + 1]; p.theta = wrap(p.theta - delta[3 * i + 2]);
    });
    history.push(graphError(poses, edges));
    if (Math.abs(history[pass] - history[pass + 1]) < 1e-4 * (1 + history[pass])) break; // a pass that barely helps is the last one
  }
  return history;
}

/** Solve H·x = b for symmetric positive-definite H (overwritten with its Cholesky factor). */
export function solveCholesky(H: Float64Array, b: Float64Array, n: number): Float64Array {
  for (let j = 0; j < n; j++) {
    let d = H[j * n + j];
    for (let k = 0; k < j; k++) d -= H[j * n + k] ** 2;
    if (d <= 0) throw new Error("solveCholesky: matrix is not positive definite");
    const l = Math.sqrt(d);
    H[j * n + j] = l;
    for (let i = j + 1; i < n; i++) {
      let v = H[i * n + j];
      for (let k = 0; k < j; k++) v -= H[i * n + k] * H[j * n + k];
      H[i * n + j] = v / l;
    }
  }
  const x = Float64Array.from(b);
  for (let i = 0; i < n; i++) { for (let k = 0; k < i; k++) x[i] -= H[i * n + k] * x[k]; x[i] /= H[i * n + i]; }
  for (let i = n - 1; i >= 0; i--) { for (let k = i + 1; k < n; k++) x[i] -= H[k * n + i] * x[k]; x[i] /= H[i * n + i]; }
  return x;
}

export const diagonal = (x: number, y: number, theta: number): number[] => [x, 0, 0, 0, y, 0, 0, 0, theta];

/**
 * Turn the information ICP reports (about a small motion of the source scan in the target frame) into information
 * about the edge's own error, which is measured in the frame the edge points to. With M mapping that small motion
 * to a change of z, and D rotating into the edge's frame, this is (D·M)⁻ᵀ… spelled out: K = D·M, result = K⁻ᵀ·H·K⁻¹.
 */
export function icpInformation(H: number[], z: Pose, scale: number): number[] {
  const c = Math.cos(z.theta), s = Math.sin(z.theta);
  // M⁻¹ = [[1, 0, z.y], [0, 1, −z.x], [0, 0, 1]];  D⁻¹ = blockdiag(Rz, 1);  K⁻¹ = M⁻¹·D⁻¹
  const K = [c, -s, z.y, s, c, -z.x, 0, 0, 1];
  const out = new Array<number>(9).fill(0);
  for (let u = 0; u < 3; u++)
    for (let v = 0; v < 3; v++)
      for (let a = 0; a < 3; a++)
        for (let b2 = 0; b2 < 3; b2++) out[u * 3 + v] += K[a * 3 + u] * H[a * 3 + b2] * K[b2 * 3 + v] * scale;
  return out;
}
