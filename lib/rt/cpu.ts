import type { Bvh } from "./bvh";
import type { Scene, Vec3 } from "./scene";

/**
 * The path tracer in plain TypeScript, f64, one ray at a time. It exists for two reasons: a test can hold the BVH and
 * the GPU kernel to it, and an instrument can show one path bounce by bounce, which a GPU cannot do for a reader. The
 * algorithm is the kernel's, line for line: cosine-weighted bounces off Lambert surfaces, lights that emit from their
 * front face only, Russian roulette after the third bounce, and the kernel's four ways of looking for the lamp
 * (`strategy`: 0 uniform, 1 cosine, 2 cosine + asking the lamp directly, 3 both, weighted).
 */
export interface Hit { t: number; triangle: number; /** BVH nodes visited */ steps: number }
export type Rng = () => number;
/** One vertex of a path: where it hit, what the path was still worth when it arrived, and what it hit. */
export interface PathVertex { at: Vec3; throughput: Vec3; emitted: boolean; albedo: Vec3 }

const INNER = 0x80000000, MISS: Hit = { t: Infinity, triangle: -1, steps: 0 };

/** PCG hash (Jarzynski & Olano 2020): the same one the kernel uses, so a pixel's random numbers can be reproduced. */
export function pcg(v: number): number {
  const s = (Math.imul(v, 747796405) + 2891336453) >>> 0, w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0;
  return ((w >>> 22) ^ w) >>> 0;
}
/** The stream for one sample of one pixel. */
export function streamFor(pixel: number, sample: number): Rng {
  let state = pcg((pixel + pcg(sample)) >>> 0);
  return () => { state = pcg(state); return state / 4294967296; };
}

export class Tracer {
  private readonly nf: Float32Array; private readonly nu: Uint32Array; private readonly tf: Float32Array; private readonly tu: Uint32Array;
  constructor(readonly scene: Scene, readonly bvh: Bvh) {
    this.nf = new Float32Array(bvh.nodes); this.nu = new Uint32Array(bvh.nodes); this.tf = new Float32Array(bvh.triangles); this.tu = new Uint32Array(bvh.triangles);
  }

  /** Möller–Trumbore against packed triangle i; the distance, or Infinity. */
  private triangle(i: number, o: Vec3, d: Vec3, eps: number): number {
    const f = this.tf, b = i * 12;
    const e1x = f[b + 4] - f[b], e1y = f[b + 5] - f[b + 1], e1z = f[b + 6] - f[b + 2], e2x = f[b + 8] - f[b], e2y = f[b + 9] - f[b + 1], e2z = f[b + 10] - f[b + 2];
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x, det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) return Infinity;
    const inv = 1 / det, sx = o[0] - f[b], sy = o[1] - f[b + 1], sz = o[2] - f[b + 2], u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) return Infinity;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
    if (v < 0 || u + v > 1) return Infinity;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    return t > eps ? t : Infinity;
  }

  /** Every triangle, no hierarchy: what the BVH has to agree with. */
  brute(o: Vec3, d: Vec3, eps = 1e-6): Hit {
    let best: Hit = MISS;
    for (let i = 0; i < this.bvh.triangleCount; i++) { const t = this.triangle(i, o, d, eps); if (t < best.t) best = { t, triangle: i, steps: 0 }; }
    return best;
  }

  private box(node: number, o: Vec3, inv: Vec3, tMax: number): number {
    const f = this.nf, b = node * 8;
    let near = 0, far = tMax;
    for (let k = 0; k < 3; k++) {
      const t0 = (f[b + k] - o[k]) * inv[k], t1 = (f[b + 4 + k] - o[k]) * inv[k];
      near = Math.max(near, Math.min(t0, t1)); far = Math.min(far, Math.max(t0, t1));
    }
    return near <= far ? near : Infinity;
  }

  /** Stack traversal, nearer child first: the kernel's loop. */
  hit(o: Vec3, d: Vec3, eps = 1e-6): Hit {
    const inv: Vec3 = [1 / d[0], 1 / d[1], 1 / d[2]], stack: number[] = [];
    let best: Hit = MISS, node = 0, steps = 0;
    for (;;) {
      steps++;
      const a = this.nu[node * 8 + 3], b = this.nu[node * 8 + 7];
      if ((b & INNER) === 0) {
        for (let i = a; i < a + b; i++) { const t = this.triangle(i, o, d, eps); if (t < best.t) best = { t, triangle: i, steps }; }
      } else {
        const right = (b & ~INNER) >>> 0, tl = this.box(a, o, inv, best.t), tr = this.box(right, o, inv, best.t);
        if (tl < Infinity || tr < Infinity) {
          const nearFirst = tl <= tr;
          if ((nearFirst ? tr : tl) < Infinity) stack.push(nearFirst ? right : a);
          node = nearFirst ? a : right;
          continue;
        }
      }
      if (!stack.length) break;
      node = stack.pop() as number;
    }
    return { ...best, steps };
  }

  /** The geometric normal of packed triangle i (counter-clockwise = outwards), unit length. */
  normal(i: number): Vec3 {
    const f = this.tf, b = i * 12, e1: Vec3 = [f[b + 4] - f[b], f[b + 5] - f[b + 1], f[b + 6] - f[b + 2]], e2: Vec3 = [f[b + 8] - f[b], f[b + 9] - f[b + 1], f[b + 10] - f[b + 2]];
    const n: Vec3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(...n) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  }
  materialOf(i: number) { return this.scene.materials[this.tu[i * 12 + 3]]; }

  /** The ray through pixel (x, y) of a w × h picture, jittered inside the pixel by (jx, jy) in 0…1. */
  cameraRay(x: number, y: number, w: number, h: number, jx: number, jy: number): { o: Vec3; d: Vec3 } {
    const { eye, target, fov } = this.scene.camera, f = unit(sub(target, eye)), right = unit(cross(f, [0, 1, 0])), up = cross(right, f), half = Math.tan((fov * Math.PI) / 360);
    const u = (((x + jx) / w) * 2 - 1) * half * (w / h), v = (1 - ((y + jy) / h) * 2) * half;
    return { o: eye, d: unit([f[0] + right[0] * u + up[0] * v, f[1] + right[1] * u + up[1] * v, f[2] + right[2] * u + up[2] * v]) };
  }

  /**
   * One path. `maxBounces` counts scattering events: 0 sees only what glows. Returns the radiance and, for the
   * instrument that draws a path, every vertex with the throughput it arrived with.
   */
  radiance(o: Vec3, d: Vec3, rng: Rng, maxBounces = 16, strategy = 1): { rgb: Vec3; path: PathVertex[]; rays: number; /** where the last ray went, if it hit nothing */ escaped: { from: Vec3; direction: Vec3 } | null } {
    const rgb: Vec3 = [0, 0, 0], through: Vec3 = [1, 1, 1], path: PathVertex[] = [];
    let rays = 0, scale = 1, escaped: { from: Vec3; direction: Vec3 } | null = null, lastPdf = 0;
    const L = this.scene.light, lamp = L && strategy >= 2 ? L : null, lampCross = L ? cross(L.u, L.v) : [0, 0, 1] as Vec3, lampArea = Math.hypot(...lampCross), lampNormal = unit(lampCross);
    for (let bounce = 0; ; bounce++) {
      rays++;
      const h = this.hit(o, d, 1e-5 * scale);
      if (h.triangle < 0) { escaped = { from: o, direction: d }; break; }
      const at: Vec3 = [o[0] + d[0] * h.t, o[1] + d[1] * h.t, o[2] + d[2] * h.t], m = this.materialOf(h.triangle);
      let n = this.normal(h.triangle);
      const front = n[0] * d[0] + n[1] * d[1] + n[2] * d[2] < 0;
      if (front && m.emit.some((e) => e > 0)) { // a light shines from its front only
        let weight = 1; // the eye sees the lamp in full; a bounce that ran into it shares with the direct question
        if (lamp && bounce > 0) {
          if (strategy === 2) weight = 0;
          else { const direct = (h.t * h.t) / (Math.max(-(n[0] * d[0] + n[1] * d[1] + n[2] * d[2]), 1e-6) * lampArea); weight = (lastPdf * lastPdf) / (lastPdf * lastPdf + direct * direct); }
        }
        for (let k = 0; k < 3; k++) rgb[k] += through[k] * m.emit[k] * weight;
      }
      path.push({ at, throughput: [...through], emitted: front && m.emit.some((e) => e > 0), albedo: m.albedo });
      if (bounce >= maxBounces) break;
      if (!front) n = [-n[0], -n[1], -n[2]];
      scale = Math.max(1, Math.abs(at[0]), Math.abs(at[1]), Math.abs(at[2])); // offsets grow with the numbers they are added to
      const lifted: Vec3 = [at[0] + n[0] * 1e-4 * scale, at[1] + n[1] * 1e-4 * scale, at[2] + n[2] * 1e-4 * scale];
      if (lamp) { // ask the lamp directly: a random point on it, one shadow ray
        const s = rng(), t = rng(), to: Vec3 = [lamp.corner[0] + lamp.u[0] * s + lamp.v[0] * t - at[0], lamp.corner[1] + lamp.u[1] * s + lamp.v[1] * t - at[1], lamp.corner[2] + lamp.u[2] * s + lamp.v[2] * t - at[2]];
        const distance = Math.hypot(...to), l: Vec3 = [to[0] / distance, to[1] / distance, to[2] / distance], cosLamp = -(l[0] * lampNormal[0] + l[1] * lampNormal[1] + l[2] * lampNormal[2]), cosine = n[0] * l[0] + n[1] * l[1] + n[2] * l[2];
        if (cosLamp > 0 && cosine > 0) {
          rays++;
          if (this.hit(lifted, l, 1e-5 * scale).t >= distance * 0.999) {
            const direct = (distance * distance) / (cosLamp * lampArea), scattered = cosine / Math.PI, weight = strategy === 3 ? (direct * direct) / (direct * direct + scattered * scattered) : 1, emit = this.scene.materials[lamp.material].emit;
            for (let k = 0; k < 3; k++) rgb[k] += ((through[k] * m.albedo[k]) / Math.PI) * emit[k] * (cosine / direct) * weight;
          }
        }
      }
      let albedo = m.albedo;
      if (bounce > 2) { // Russian roulette: stop with the probability the path has of mattering less, and pay the survivors back
        const p = Math.max(albedo[0], albedo[1], albedo[2]);
        if (rng() >= p) break;
        albedo = [albedo[0] / p, albedo[1] / p, albedo[2] / p];
      }
      for (let k = 0; k < 3; k++) through[k] *= albedo[k];
      if (through[0] + through[1] + through[2] === 0) break;
      // Cosine-weighted direction about n: the pdf cancels the cosine and the 1/π of a Lambert surface.
      const r1 = 2 * Math.PI * rng(), r2 = rng();
      let r = Math.sqrt(r2), z = Math.sqrt(1 - r2);
      if (strategy === 0) { z = r2; r = Math.sqrt(1 - z * z); for (let k = 0; k < 3; k++) through[k] *= 2 * z; } // uniform: the density cancels nothing, the path pays 2·cos
      lastPdf = strategy === 0 ? 1 / (2 * Math.PI) : z / Math.PI;
      const t = unit(cross(Math.abs(n[0]) > 0.1 ? [0, 1, 0] : [1, 0, 0], n)), b = cross(n, t);
      o = lifted;
      d = unit([t[0] * Math.cos(r1) * r + b[0] * Math.sin(r1) * r + n[0] * z, t[1] * Math.cos(r1) * r + b[1] * Math.sin(r1) * r + n[1] * z, t[2] * Math.cos(r1) * r + b[2] * Math.sin(r1) * r + n[2] * z]);
    }
    return { rgb, path, rays, escaped };
  }
}

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
