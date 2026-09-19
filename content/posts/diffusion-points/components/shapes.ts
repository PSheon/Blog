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

/** A pair of cherries: two dark red spheres hanging from stems that meet at a leaf. */
const CHERRY = [[-0.42, 0, -0.45], [0.38, 0.1, -0.52]] as const, JOINT = [0.05, 0, 0.72] as const;
export const cherries: Shape = parts([
  [10, (rng) => {
    const [cx, cy, cz] = CHERRY[rng() < 0.5 ? 0 : 1], [dx, dy, dz] = direction(rng);
    // A small dent where the stem goes in, and a highlight on the upper side.
    const r = 0.36 * (1 - 0.18 * Math.max(0, dz) ** 6), shine = clamp01((dz * 0.6 + dx * 0.5 - 0.55) * 4);
    return point(cx + r * dx, cy + r * dy, cz + r * dz, mix(mix([0.45, 0.02, 0.08], [0.78, 0.05, 0.12], clamp01(0.5 + 0.5 * dz)), [1, 0.75, 0.75], shine));
  }],
  [2.2, (rng) => {
    const [cx, cy, cz] = CHERRY[rng() < 0.5 ? 0 : 1], t = rng(), a = rng() * 2 * Math.PI, bow = Math.sin(Math.PI * t) * 0.12;
    const x = cx + (JOINT[0] - cx) * t + bow * Math.sign(cx), z = cz + 0.33 + (JOINT[2] - cz - 0.33) * t;
    return point(x + 0.018 * Math.cos(a), cy * (1 - t) + 0.018 * Math.sin(a), z, mix([0.35, 0.5, 0.15], [0.3, 0.35, 0.1], t));
  }],
  [1.6, (rng) => { const u = rng() * 2 - 1, v = (rng() * 2 - 1) * (1 - u * u); return point(JOINT[0] + 0.28 + 0.26 * u, 0.13 * v, JOINT[2] + 0.06 - 0.1 * u * u, mix([0.15, 0.5, 0.15], [0.4, 0.72, 0.22], rng())); }],
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

/** A strawberry: a red cone rounded at the shoulders, pale seeds in rows, a green star of sepals on top. */
export const strawberry: Shape = parts([
  [10, (rng) => {
    const t = Math.sqrt(rng()), a = rng() * 2 * Math.PI; // t = 0 at the tip, 1 at the shoulders; more skin up there
    const r = 0.62 * Math.sin(t * Math.PI * 0.56) ** 0.8 * (1 - 0.35 * clamp01((t - 0.8) * 5) ** 2), z = -0.85 + 1.45 * t;
    const seed = Math.sin(a * 9 + Math.floor(t * 11) * 1.7) > 0.86 && (t * 11) % 1 > 0.35 && (t * 11) % 1 < 0.65;
    return point(r * Math.cos(a), r * Math.sin(a), z, seed ? [0.98, 0.9, 0.55] : mix([0.95, 0.2, 0.18], [0.75, 0.04, 0.1], clamp01(1.1 - t)));
  }],
  [2.4, (rng) => {
    const leaf = Math.floor(rng() * 6), u = rng(), w = (rng() * 2 - 1) * 0.11 * (1 - u), a = (leaf / 6) * 2 * Math.PI, reach = 0.06 + 0.42 * u;
    return point(reach * Math.cos(a) - w * Math.sin(a), reach * Math.sin(a) + w * Math.cos(a), 0.62 - 0.22 * u * u, mix([0.2, 0.55, 0.15], [0.4, 0.75, 0.25], rng()));
  }],
  [0.4, (rng) => { const t = rng(), a = rng() * 2 * Math.PI; return point(0.025 * Math.cos(a), 0.025 * Math.sin(a), 0.62 + 0.22 * t, [0.3, 0.5, 0.15]); }],
]);

/** A pear: a wide belly, a narrow neck, green going yellow with a blush on one side, and a stem. */
export const pear: Shape = parts([
  [10, (rng) => {
    const t = rng(), a = rng() * 2 * Math.PI, z = -0.9 + 1.55 * t;
    // Two overlapping bumps, the belly low down and the neck higher up, rounded off at both ends.
    const r = (0.6 * Math.exp(-(((t - 0.3) / 0.3) ** 2)) + 0.3 * Math.exp(-(((t - 0.78) / 0.2) ** 2))) * Math.sin(Math.PI * clamp01(t)) ** 0.35;
    const blush = clamp01(Math.cos(a - 0.8) * 0.9 - 0.2) * clamp01(1.2 - t * 1.4);
    return point(r * Math.cos(a), r * Math.sin(a), z, mix(mix([0.62, 0.74, 0.22], [0.9, 0.85, 0.3], clamp01(1 - t * 1.2)), [0.85, 0.35, 0.2], blush * 0.7));
  }],
  [0.5, (rng) => { const t = rng(), a = rng() * 2 * Math.PI; return point(0.025 * Math.cos(a) + 0.1 * t * t, 0.025 * Math.sin(a), 0.63 + 0.3 * t, [0.36, 0.24, 0.1]); }],
]);

export const SHAPES = { apple, banana, watermelon, strawberry, cherries, pear } as const;
export type ShapeName = keyof typeof SHAPES;
