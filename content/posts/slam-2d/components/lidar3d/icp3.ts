import type { Rng } from "@/lib/ml";

/** A rigid motion in 3-D: row-major 3×3 rotation and a translation. */
export interface Pose3 { R: number[]; t: [number, number, number] }
export const IDENTITY: Pose3 = { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] };

export function apply(p: Pose3, x: number, y: number, z: number): [number, number, number] {
  const R = p.R;
  return [R[0] * x + R[1] * y + R[2] * z + p.t[0], R[3] * x + R[4] * y + R[5] * z + p.t[1], R[6] * x + R[7] * y + R[8] * z + p.t[2]];
}
export function compose3(a: Pose3, b: Pose3): Pose3 {
  const R = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) R[i * 3 + j] += a.R[i * 3 + k] * b.R[k * 3 + j];
  return { R, t: apply(a, ...b.t) };
}
export function inverse3(a: Pose3): Pose3 {
  const R = [a.R[0], a.R[3], a.R[6], a.R[1], a.R[4], a.R[7], a.R[2], a.R[5], a.R[8]];
  return { R, t: [-(R[0] * a.t[0] + R[1] * a.t[1] + R[2] * a.t[2]), -(R[3] * a.t[0] + R[4] * a.t[1] + R[5] * a.t[2]), -(R[6] * a.t[0] + R[7] * a.t[1] + R[8] * a.t[2])] };
}
/** Rotation from roll, pitch, yaw (x, y, z axes; applied z·y·x). */
export function fromEuler(roll: number, pitch: number, yaw: number, t: [number, number, number] = [0, 0, 0]): Pose3 {
  const cr = Math.cos(roll), sr = Math.sin(roll), cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  return { R: [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr, sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr, -sp, cp * sr, cp * cr], t };
}
export const rotationAngle = (p: Pose3) => Math.acos(Math.max(-1, Math.min(1, (p.R[0] + p.R[4] + p.R[8] - 1) / 2)));

/** Axis-aligned boxes [x0, y0, z0, x1, y1, z1]; the first one is the room, seen from inside. */
export type Box = [number, number, number, number, number, number];
export const ROOM: Box[] = [
  [0, 0, 0, 16, 12, 4],
  [3, 2, 0, 5, 3.5, 1.2], [9, 1, 0, 10, 2, 3], [12, 5, 0, 14.5, 7, 0.8], [6, 7, 0, 7.5, 9.5, 2], [1, 8, 0, 2.5, 11, 1.5], [10, 9, 0, 13, 10, 2.5], [7, 4, 0, 8, 5, 0.6],
];

export interface Cloud {
  /** RINGS × AZIMUTHS points in the sensor frame, NaN where nothing was hit; organised like the sensor sweeps. */
  points: Float64Array;
  normals: Float64Array;
}
export const RINGS = 16, AZIMUTHS = 360, RANGE = 25;

/** A 16-ring spinning lidar (±15° vertical), with range noise in metres. */
export function sweep(world: Box[], pose: Pose3, rng: Rng, noise = 0.02): Cloud {
  const points = new Float64Array(RINGS * AZIMUTHS * 3).fill(NaN);
  const o = pose.t;
  for (let r = 0; r < RINGS; r++) {
    const el = ((r / (RINGS - 1)) * 30 - 15) * (Math.PI / 180), ce = Math.cos(el), se = Math.sin(el);
    for (let a = 0; a < AZIMUTHS; a++) {
      const az = (a / AZIMUTHS) * 2 * Math.PI, lx = ce * Math.cos(az), ly = ce * Math.sin(az), lz = se;
      const R = pose.R, dx = R[0] * lx + R[1] * ly + R[2] * lz, dy = R[3] * lx + R[4] * ly + R[5] * lz, dz = R[6] * lx + R[7] * ly + R[8] * lz;
      let best = RANGE;
      world.forEach((b, i) => {
        const hit = rayBox(o, [dx, dy, dz], b, i === 0);
        if (hit > 1e-6 && hit < best) best = hit;
      });
      if (best >= RANGE) continue;
      const range = best + noise * Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng()), k = (r * AZIMUTHS + a) * 3;
      points[k] = lx * range; points[k + 1] = ly * range; points[k + 2] = lz * range;
    }
  }
  return { points, normals: normalsOf(points) };
}

function rayBox(o: number[], d: number[], b: Box, inside: boolean): number {
  let tNear = -Infinity, tFar = Infinity;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-12) { if (o[k] < b[k] || o[k] > b[k + 3]) return Infinity; continue; }
    let t0 = (b[k] - o[k]) / d[k], t1 = (b[k + 3] - o[k]) / d[k];
    if (t0 > t1) [t0, t1] = [t1, t0];
    tNear = Math.max(tNear, t0); tFar = Math.min(tFar, t1);
  }
  if (tNear > tFar) return Infinity;
  return inside ? tFar : tNear > 0 ? tNear : Infinity;
}

/** Surface normals from the sweep's own grid: cross product of the neighbour along the ring and the neighbour on the next ring. */
function normalsOf(p: Float64Array): Float64Array {
  const n = new Float64Array(p.length).fill(NaN);
  for (let r = 0; r < RINGS - 1; r++)
    for (let a = 0; a < AZIMUTHS; a++) {
      const i = (r * AZIMUTHS + a) * 3, j = (r * AZIMUTHS + ((a + 1) % AZIMUTHS)) * 3, k = ((r + 1) * AZIMUTHS + a) * 3;
      if (Number.isNaN(p[i]) || Number.isNaN(p[j]) || Number.isNaN(p[k])) continue;
      const ux = p[j] - p[i], uy = p[j + 1] - p[i + 1], uz = p[j + 2] - p[i + 2], vx = p[k] - p[i], vy = p[k + 1] - p[i + 1], vz = p[k + 2] - p[i + 2];
      if (Math.hypot(ux, uy, uz) > 0.5 || Math.hypot(vx, vy, vz) > 1.5) continue; // neighbours on different surfaces
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, len = Math.hypot(nx, ny, nz);
      if (len < 1e-9) continue;
      n[i] = nx / len; n[i + 1] = ny / len; n[i + 2] = nz / len;
    }
  return n;
}

export interface Match3 { pose: Pose3; rms: number; inliers: number; iterations: number; ms: number }

/**
 * Point-to-plane ICP in 3-D. Same idea as the 2-D one — nearest neighbour, then slide points onto the surface they
 * landed near — but the neighbour search needs a voxel grid (there are thousands of points) and the small motion
 * has six unknowns: three of translation, three of rotation.
 */
export function icp3(target: Cloud, source: Cloud, guess: Pose3, { iterations = 20, gate = 1.0, stride = 3, cell = 0.6 } = {}): Match3 {
  const t0 = performance.now(), T = target.points, N = target.normals;
  const grid = new Map<number, number[]>(), key = (x: number, y: number, z: number) => (Math.floor(x / cell) + 512) * 1048576 + (Math.floor(y / cell) + 512) * 1024 + Math.floor(z / cell) + 512;
  for (let i = 0; i < T.length; i += 3) {
    if (Number.isNaN(T[i]) || Number.isNaN(N[i])) continue;
    const k = key(T[i], T[i + 1], T[i + 2]), bucket = grid.get(k);
    if (bucket) bucket.push(i); else grid.set(k, [i]);
  }
  let pose = guess, rms = Infinity, inliers = 0, it = 0;
  for (; it < iterations; it++) {
    const limit = Math.max(0.3, gate * 0.75 ** it), H = new Float64Array(36), g = new Float64Array(6);
    let count = 0, tried = 0, err = 0;
    for (let s = 0; s < source.points.length; s += 3 * stride) {
      if (Number.isNaN(source.points[s])) continue;
      tried++;
      const [x, y, z] = apply(pose, source.points[s], source.points[s + 1], source.points[s + 2]);
      let best = limit * limit, at = -1;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const bucket = grid.get(key(x + dx * cell, y + dy * cell, z + dz * cell));
        if (!bucket) continue;
        for (const i of bucket) { const d = (x - T[i]) ** 2 + (y - T[i + 1]) ** 2 + (z - T[i + 2]) ** 2; if (d < best) { best = d; at = i; } }
      }
      if (at < 0) continue;
      const nx = N[at], ny = N[at + 1], nz = N[at + 2], r = nx * (x - T[at]) + ny * (y - T[at + 1]) + nz * (z - T[at + 2]);
      // small motion (t, ω): the point moves by t + ω × p, so the distance to the plane changes by n·t + (p × n)·ω
      const J = [nx, ny, nz, y * nz - z * ny, z * nx - x * nz, x * ny - y * nx];
      for (let a = 0; a < 6; a++) { g[a] += J[a] * r; for (let b = 0; b < 6; b++) H[a * 6 + b] += J[a] * J[b]; }
      count++; err += r * r;
    }
    if (count < 30) break;
    rms = Math.sqrt(err / count); inliers = count / tried;
    const d = solve6(H, g);
    const step = fromEuler(-d[3], -d[4], -d[5], [-d[0], -d[1], -d[2]]);
    pose = compose3(step, pose);
    if (Math.hypot(d[0], d[1], d[2]) < 1e-4 && Math.hypot(d[3], d[4], d[5]) < 1e-5) { it++; break; }
  }
  return { pose, rms, inliers, iterations: it, ms: performance.now() - t0 };
}

function solve6(H: Float64Array, g: Float64Array): number[] {
  const n = 6, M = Array.from({ length: n }, (_, i) => [...Array.from({ length: n }, (_, j) => H[i * n + j] + (i === j ? 1e-6 : 0)), g[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((row, i) => row[n] / row[i]);
}
