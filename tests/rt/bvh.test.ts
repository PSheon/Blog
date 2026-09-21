import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/ml";
import { Tracer, buildBvh, cornell, pcg, streamFor, unit, type Vec3 } from "@/lib/rt";

const scene = cornell(3000), bvh = buildBvh(scene), tracer = new Tracer(scene, bvh);

describe("the BVH", () => {
  it("keeps every triangle exactly once", () => {
    expect(bvh.triangleCount).toBe(scene.material.length);
    expect([...bvh.order].sort((a, b) => a - b)).toEqual(Array.from({ length: bvh.triangleCount }, (_, i) => i));
  });

  it("agrees with testing every triangle, ray by ray", () => {
    const rng = mulberry32(1);
    let hits = 0;
    for (let i = 0; i < 2000; i++) {
      const o: Vec3 = [(rng() - 0.5) * 1.6, (rng() - 0.5) * 1.6, (rng() - 0.5) * 1.6 + (i % 2 ? 2.5 : 0)], d = unit([rng() - 0.5, rng() - 0.5, rng() - 0.5 - (i % 2 ? 1 : 0)]);
      const a = tracer.hit(o, d), b = tracer.brute(o, d);
      expect(a.t).toBe(b.t); // the same triangle routine: the same number, not merely a close one
      if (b.triangle >= 0) { hits++; expect(a.triangle).toBe(b.triangle); }
    }
    expect(hits).toBeGreaterThan(1500);
  });

  it("visits a handful of nodes, and barely more for a thousand times the triangles", () => {
    const steps = (triangles: number) => {
      const s = cornell(triangles), t = new Tracer(s, buildBvh(s)), rng = mulberry32(2);
      let total = 0;
      for (let i = 0; i < 400; i++) { const { o, d } = t.cameraRay(rng() * 64, rng() * 64, 64, 64, 0.5, 0.5); total += t.hit(o, d).steps; }
      return total / 400;
    };
    const small = steps(1000), large = steps(100_000);
    expect(small).toBeLessThan(25);
    expect(large / small).toBeLessThan(2); // 100× the triangles, under 2× the work
  });
});

describe("the random numbers", () => {
  it("pcg matches the published hash", () => {
    // Jarzynski & Olano's reference: pcg_hash(0) and (1), computed with 32-bit unsigned arithmetic.
    expect(pcg(0)).toBe(129708002);
    expect(pcg(1)).toBe(2831084092);
  });
  it("are uniform and differ between pixels and between samples", () => {
    const a = streamFor(5, 0), b = streamFor(6, 0), c = streamFor(5, 1), first = [a(), b(), c()];
    expect(new Set(first).size).toBe(3);
    const r = streamFor(123, 4), bins = new Array(10).fill(0);
    for (let i = 0; i < 20_000; i++) bins[Math.floor(r() * 10)]++;
    for (const n of bins) expect(Math.abs(n - 2000)).toBeLessThan(200);
  });
});

describe("the CPU path tracer", () => {
  it("sees only the light with no bounces, and the room with them", () => {
    const centre = tracer.cameraRay(32, 32, 64, 64, 0.5, 0.5), rng = streamFor(1, 1);
    expect(tracer.radiance(centre.o, centre.d, rng, 0).rgb).toEqual([0, 0, 0]); // the back wall does not glow
    let sum = 0;
    for (let s = 0; s < 400; s++) sum += tracer.radiance(centre.o, centre.d, streamFor(7, s), 16).rgb[0];
    expect(sum / 400).toBeGreaterThan(0.05);
  });

  it("a light shines downwards only", () => {
    // From just above the ceiling light, looking down at it: its back face is dark.
    expect(tracer.radiance([0, 1.5, 0], [0, -1, 0], streamFor(1, 1), 0).rgb).toEqual([0, 0, 0]);
    expect(tracer.radiance([0, 0.9, 0], [0, 1, 0], streamFor(1, 1), 0).rgb[0]).toBe(15); // from just under it (a torus hangs between it and the origin)
  });

  it("noise falls as one over the square root of the samples", () => {
    // The standard error of a pixel's mean over N paths, measured over 40 independent repeats, at N and at 16 N.
    const { o, d } = tracer.cameraRay(20, 40, 64, 64, 0.5, 0.5);
    const spread = (n: number) => {
      const means: number[] = [];
      for (let rep = 0; rep < 40; rep++) { let s = 0; for (let k = 0; k < n; k++) s += tracer.radiance(o, d, streamFor(1000 + rep, k), 16).rgb[1]; means.push(s / n); }
      const m = means.reduce((x, y) => x + y, 0) / means.length;
      return Math.sqrt(means.reduce((x, y) => x + (y - m) ** 2, 0) / means.length);
    };
    const ratio = spread(16) / spread(256);
    expect(ratio).toBeGreaterThan(2.5); // √16 = 4, within what 40 repeats can tell
    expect(ratio).toBeLessThan(6.5);
  });
});
