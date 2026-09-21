import { describe, expect, it } from "vitest";
import { buildBvh, ggxBounce, ggxD, ggxG1, streamFor, studio, Tracer, type Vec3 } from "@/lib/rt";

describe("GGX, as the kernel has it", () => {
  const views: Vec3[] = [[0, 0, 1], [0.6, 0, 0.8], [0.95, 0, Math.sqrt(1 - 0.95 * 0.95)]];

  it("never gives back more than it was given, and nearly all of it when smooth (the white furnace)", () => {
    for (const roughness of [0.05, 0.3, 0.6, 1]) for (const v of views) {
      const a = roughness * roughness, rng = streamFor(7, Math.round(roughness * 100)), N = 40_000;
      let sum = 0;
      for (let i = 0; i < N; i++) sum += ggxBounce(a, v, rng(), rng())?.weight ?? 0;
      expect(sum / N).toBeLessThanOrEqual(1);
      if (roughness <= 0.05) expect(sum / N).toBeGreaterThan(0.97);
      if (roughness === 1 && v[2] === 1) expect(sum / N).toBeLessThan(0.9); // single scattering loses the light that would have bounced between facets
    }
  });

  it("draws directions with the density it claims: the density, integrated over the sky, is the share of bounces that stay above the surface", () => {
    for (const roughness of [0.2, 0.5, 0.9]) {
      const a = roughness * roughness, v: Vec3 = [0.6, 0, 0.8], rng = streamFor(11, Math.round(roughness * 100)), N = 200_000;
      let kept = 0, integral = 0;
      for (let i = 0; i < N; i++) {
        if (ggxBounce(a, v, rng(), rng())) kept++;
        // the same density, integrated by brute force over uniformly chosen directions
        const z = rng(), phi = 2 * Math.PI * rng(), r = Math.sqrt(1 - z * z), l: Vec3 = [r * Math.cos(phi), r * Math.sin(phi), z], h: Vec3 = [v[0] + l[0], v[1] + l[1], v[2] + l[2]], len = Math.hypot(...h);
        integral += ((ggxD(a, h[2] / len) * ggxG1(a, v[2])) / (4 * v[2])) * 2 * Math.PI;
      }
      expect(integral / N).toBeCloseTo(kept / N, 1);
      expect(Math.abs(integral / N - kept / N)).toBeLessThan(roughness < 0.3 ? 0.08 : 0.02); // a sharp lobe is a hard thing to integrate blindly
    }
  });
});

describe("the studio", () => {
  const scene = studio();
  it("has balls whose corner normals agree with the side their triangles face", () => {
    const P = scene.positions, smooth = scene.smooth!, normals = scene.normals!;
    let checked = 0;
    for (let t = 0; t < smooth.length; t++) {
      if (smooth[t] < 0) continue;
      const a = P.slice(t * 9, t * 9 + 3), b = P.slice(t * 9 + 3, t * 9 + 6), c = P.slice(t * 9 + 6, t * 9 + 9), e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const g = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      for (let k = 0; k < 3; k++) { const n = normals.slice(smooth[t] * 9 + k * 3, smooth[t] * 9 + k * 3 + 3); expect(g[0] * n[0] + g[1] * n[1] + g[2] * n[2]).toBeGreaterThan(0); }
      checked++;
    }
    expect(checked).toBeGreaterThan(5000);
  });

  it("keeps the lamp's power when the lamp changes size", () => {
    for (const lamp of [0.05, 0.3, 0.6]) { const s = studio({ lamp }), emit = s.materials[s.light!.material].emit[0]; expect(emit * 4 * lamp * lamp).toBeCloseTo(15 * 0.36, 6); }
  });

  it("packs a normal index for every smooth triangle", () => {
    const bvh = buildBvh(scene), tu = new Uint32Array(bvh.triangles);
    let smooth = 0;
    for (let i = 0; i < bvh.triangleCount; i++) if (tu[i * 12 + 7] > 0) smooth++;
    expect(smooth).toBe(scene.normals!.length / 9);
    expect(bvh.normals!.byteLength).toBe(smooth * 48);
    expect(new Tracer(scene, bvh).hit([0, 0, 3.4], [0, 0, -1]).triangle).toBeGreaterThanOrEqual(0);
  });
});
