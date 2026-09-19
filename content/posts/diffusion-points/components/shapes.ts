import type { Rng, Shape } from "./diffusion";

const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v: number[]) => { const l = Math.hypot(...v); return v.map((x) => x / l); };

/** Points on a tube around a trefoil knot, scaled to fit in about [−1, 1]. */
export const knot: Shape = (rng: Rng) => {
  const t = rng() * 2 * Math.PI, a = rng() * 2 * Math.PI;
  const curve = (s: number) => [Math.sin(s) + 2 * Math.sin(2 * s), Math.cos(s) - 2 * Math.cos(2 * s), -Math.sin(3 * s)];
  const p = curve(t), q = curve(t + 1e-3), tangent = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
  const n1 = unit(cross(tangent, [0.3, 0.5, 0.8])), n2 = unit(cross(tangent, n1));
  return [0, 1, 2].map((k) => (p[k] + 0.54 * (Math.cos(a) * n1[k] + Math.sin(a) * n2[k])) / 3) as [number, number, number];
};

/** Points on a torus. */
export const torus: Shape = (rng: Rng) => {
  const u = rng() * 2 * Math.PI, v = rng() * 2 * Math.PI, r = 0.7 + 0.25 * Math.cos(v);
  return [r * Math.cos(u), r * Math.sin(u), 0.25 * Math.sin(v)];
};

/** A shape given as sampled surface points (x, y, z, x, y, z, …): pick one at random. */
export function fromPoints(points: ArrayLike<number>): Shape {
  return (rng: Rng) => {
    const i = Math.floor(rng() * (points.length / 3)) * 3;
    return [points[i], points[i + 1], points[i + 2]];
  };
}
