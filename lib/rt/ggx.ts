import type { Vec3 } from "./scene";

/**
 * The kernel's GGX, in TypeScript, in the frame of the surface (z = normal, a = roughness²). It exists so that tests
 * can hold the formulas to what they must satisfy: the density integrates to one, and a white metal never returns more
 * light than it received. Heitz, "Sampling the GGX Distribution of Visible Normals", JCGT 2018.
 */
export const ggxD = (a: number, nh: number): number => { const k = nh * nh * (a * a - 1) + 1; return (a * a) / (Math.PI * k * k); };
export const ggxG1 = (a: number, nx: number): number => (2 * nx) / (nx + Math.sqrt(a * a + (1 - a * a) * nx * nx));

export function ggxVisibleNormal(a: number, v: Vec3, u1: number, u2: number): Vec3 {
  const l0 = Math.hypot(a * v[0], a * v[1], v[2]), vh: Vec3 = [(a * v[0]) / l0, (a * v[1]) / l0, v[2] / l0], lensq = vh[0] * vh[0] + vh[1] * vh[1];
  const t1: Vec3 = lensq > 0 ? [-vh[1] / Math.sqrt(lensq), vh[0] / Math.sqrt(lensq), 0] : [1, 0, 0], t2: Vec3 = [vh[1] * t1[2] - vh[2] * t1[1], vh[2] * t1[0] - vh[0] * t1[2], vh[0] * t1[1] - vh[1] * t1[0]];
  const r = Math.sqrt(u1), phi = 2 * Math.PI * u2, p1 = r * Math.cos(phi), s = 0.5 * (1 + vh[2]), p2 = (1 - s) * Math.sqrt(Math.max(1 - p1 * p1, 0)) + s * r * Math.sin(phi), p3 = Math.sqrt(Math.max(1 - p1 * p1 - p2 * p2, 0));
  const nh: Vec3 = [p1 * t1[0] + p2 * t2[0] + p3 * vh[0], p1 * t1[1] + p2 * t2[1] + p3 * vh[1], p1 * t1[2] + p2 * t2[2] + p3 * vh[2]], h: Vec3 = [a * nh[0], a * nh[1], Math.max(nh[2], 0)], l = Math.hypot(...h);
  return [h[0] / l, h[1] / l, h[2] / l];
}

/** One bounce off a white metal (Fresnel = 1): the mirrored direction and the weight the path carries on, or null if it went under the surface. */
export function ggxBounce(a: number, v: Vec3, u1: number, u2: number): { l: Vec3; weight: number; pdf: number } | null {
  const h = ggxVisibleNormal(a, v, u1, u2), vh = v[0] * h[0] + v[1] * h[1] + v[2] * h[2], l: Vec3 = [2 * vh * h[0] - v[0], 2 * vh * h[1] - v[1], 2 * vh * h[2] - v[2]];
  if (l[2] <= 0) return null;
  return { l, weight: ggxG1(a, l[2]), pdf: (ggxD(a, h[2]) * ggxG1(a, v[2])) / (4 * v[2]) };
}
