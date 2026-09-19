import type { Point, Rng, Shape } from "./diffusion";

/**
 * Fruit to learn, each a function that returns one random coloured point on its surface.
 * Positions fit in about [−1, 1] with z up; colours are given as 0–1 RGB and stored as −1…1.
 */
type Rgb = [number, number, number];

const point = (x: number, y: number, z: number, [r, g, b]: Rgb): Point => [x, y, z, r * 2 - 1, g * 2 - 1, b * 2 - 1];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** A uniformly random direction. */
function direction(rng: Rng): [number, number, number] {
  const z = rng() * 2 - 1, a = rng() * 2 * Math.PI, r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), r * Math.sin(a), z];
}
/** Pick one of several samplers, each with a share of the points. */
function parts(list: [number, Shape][]): Shape {
  const total = list.reduce((s, [w]) => s + w, 0);
  return (rng) => {
    let r = rng() * total;
    for (const [w, part] of list) if ((r -= w) < 0) return part(rng);
    return list[list.length - 1][1](rng);
  };
}

/** An apple: a cardioid spun around its axis gives the dimple for free. Red with a yellow blush, a stem and a leaf. */
export const apple: Shape = parts([
  [10, (rng) => {
    // Rejection-sample the angle so the points are spread evenly over the skin, not bunched at the dimple.
    let phi = 0;
    do phi = rng() * Math.PI; while (rng() > ((1 + Math.cos(phi)) * Math.sin(phi)) / 1.3);
    const a = rng() * 2 * Math.PI, rho = 0.62 * (1 + Math.cos(phi));
    const x = rho * Math.sin(phi) * Math.cos(a), y = rho * Math.sin(phi) * Math.sin(a), z = 0.55 - rho * Math.cos(phi) * 0.92;
    const blush = clamp01(0.5 + 0.5 * Math.sin(a * 1.0 + 0.6) + (z - 0.1) * 0.5);
    return point(x, y, z - 0.35, mix([0.93, 0.78, 0.25], [0.82, 0.08, 0.12], clamp01(blush * 1.3)));
  }],
  [0.5, (rng) => { const t = rng(), a = rng() * 2 * Math.PI; return point(0.03 * Math.cos(a) + 0.08 * t * t, 0.03 * Math.sin(a), 0.12 + 0.42 * t, [0.36, 0.22, 0.1]); }],
  [1.2, (rng) => { const u = rng() * 2 - 1, v = (rng() * 2 - 1) * (1 - u * u); return point(0.22 + 0.2 * u, 0.1 * v, 0.5 + 0.1 * u + 0.05 * v * v, mix([0.2, 0.55, 0.15], [0.45, 0.75, 0.2], rng())); }],
]);

/** A banana: a tapered tube along an arc, yellow with green-brown tips. */
export const banana: Shape = (rng) => {
  const t = rng(), a = rng() * 2 * Math.PI, bend = (t - 0.5) * 2.2;
  const cx = 0.95 * Math.sin(bend), cz = 0.95 * Math.cos(bend) - 0.75, r = 0.19 * Math.sin(Math.PI * clamp01(0.06 + t * 0.88)) ** 0.6 + 0.02;
  // Five flat-ish sides, like the real thing.
  const ridge = 1 - 0.1 * Math.abs(Math.sin(2.5 * a));
  const nx = Math.sin(bend), nz = Math.cos(bend);
  const tip = clamp01((Math.abs(t - 0.5) - 0.42) * 14);
  return point(cx + r * ridge * Math.cos(a) * nx, r * ridge * Math.sin(a), -(cz + r * ridge * Math.cos(a) * nz) - 0.1, mix(mix([0.98, 0.85, 0.2], [0.85, 0.75, 0.15], rng() * 0.5), [0.3, 0.25, 0.08], tip));
};

/** A bunch of grapes: purple spheres packed into a cone, with a stem. */
const BERRIES = (() => {
  const out: [number, number, number][] = [];
  for (let layer = 0; layer < 6; layer++) {
    const n = Math.max(1, 6 - layer), ring = 0.1 * (n - 1) * 1.05;
    for (let k = 0; k < n; k++) { const a = (k / n) * 2 * Math.PI + layer * 0.7; out.push([ring * Math.cos(a), ring * Math.sin(a), 0.45 - layer * 0.21]); }
    if (n > 3) out.push([0, 0, 0.45 - layer * 0.21]);
  }
  return out;
})();
export const grapes: Shape = parts([
  [14, (rng) => { const [cx, cy, cz] = BERRIES[Math.floor(rng() * BERRIES.length)], [dx, dy, dz] = direction(rng), light = clamp01(0.5 + 0.5 * dz); return point(cx + 0.14 * dx, cy + 0.14 * dy, cz + 0.14 * dz, mix([0.27, 0.08, 0.38], [0.62, 0.35, 0.78], light)); }],
  [1, (rng) => { const t = rng(), a = rng() * 2 * Math.PI; return point(0.025 * Math.cos(a) + 0.12 * t * t, 0.025 * Math.sin(a), 0.55 + 0.35 * t, [0.4, 0.3, 0.12]); }],
]);

/** A slice of watermelon: red flesh with black seeds on the two cut faces, a white band, green striped rind. */
export const watermelon: Shape = parts([
  [6, (rng) => {
    const side = rng() < 0.5 ? -1 : 1, r = Math.sqrt(rng()) * 0.95, a = rng() * Math.PI, x = r * Math.cos(a), z = r * Math.sin(a) - 0.4;
    const seed = r > 0.3 && r < 0.78 && Math.sin(a * 9) ** 2 > 0.93 && Math.sin(r * 38) > 0.2;
    const colour: Rgb = r > 0.9 ? [0.18, 0.5, 0.2] : r > 0.82 ? [0.93, 0.95, 0.85] : seed ? [0.08, 0.05, 0.05] : mix([0.95, 0.25, 0.3], [0.85, 0.12, 0.2], rng());
    return point(x, side * 0.11 * (1 - 0.0 * r), z, colour);
  }],
  [3, (rng) => { const a = rng() * Math.PI, y = (rng() * 2 - 1) * 0.11; return point(0.95 * Math.cos(a), y, 0.95 * Math.sin(a) - 0.4, Math.sin(a * 14) > 0.3 ? [0.1, 0.35, 0.14] : [0.25, 0.6, 0.25]); }],
]);

/** An orange: a slightly flattened, pitted sphere with a green star where the stalk was. */
export const orange: Shape = (rng) => {
  const [dx, dy, dz] = direction(rng), pit = 1 + 0.015 * Math.sin(dx * 40) * Math.sin(dy * 40) * Math.sin(dz * 40), r = 0.72 * pit;
  const calyx = dz > 0.965 && Math.cos(5 * Math.atan2(dy, dx)) > -0.2;
  return point(r * dx, r * dy, r * dz * 0.93, calyx ? [0.2, 0.45, 0.15] : mix([0.98, 0.55, 0.08], [0.95, 0.42, 0.05], clamp01(0.5 - dz * 0.5 + (rng() - 0.5) * 0.3)));
};

export const SHAPES = { apple, banana, grapes, watermelon, orange } as const;
export type ShapeName = keyof typeof SHAPES;
