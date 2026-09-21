import { describe, expect, it } from "vitest";
import { Tracer, buildBvh, cornell, streamFor } from "@/lib/rt";

/**
 * The four ways of looking for the lamp must agree on the answer and differ only in how noisy they are. The classic
 * mistakes (counting the lamp twice with next-event estimation, a wrong density in the MIS weight) all show up as a
 * mean that is off by far more than the noise allows.
 */
describe("sampling strategies", () => {
  const scene = cornell(1000), tracer = new Tracer(scene, buildBvh(scene)), N = 6000;
  const estimate = (x: number, y: number, strategy: number) => {
    let sum = 0, squares = 0;
    for (let s = 0; s < N; s++) { const rng = streamFor(y * 64 + x + strategy * 7919, s), ray = tracer.cameraRay(x, y, 64, 64, rng(), rng()), v = tracer.radiance(ray.o, ray.d, rng, 16, strategy).rgb[1]; sum += v; squares += v * v; }
    const mean = sum / N;
    return { mean, se: Math.sqrt(Math.max(squares / N - mean * mean, 0) / N) };
  };

  for (const [name, x, y] of [["the floor", 24, 58], ["the back wall", 32, 22], ["under a torus, in shadow", 14, 50]] as const)
    it(`agree on ${name}, and asking the lamp is the quietest`, () => {
      const [uniform, cosine, nee, mis] = [0, 1, 2, 3].map((s) => estimate(x, y, s));
      for (const other of [uniform, cosine, nee]) expect(Math.abs(other.mean - mis.mean)).toBeLessThan(4 * Math.hypot(other.se, mis.se));
      expect(mis.mean).toBeGreaterThan(0);
      expect(nee.se).toBeLessThan(cosine.se * 0.6);
      expect(mis.se).toBeLessThan(cosine.se * 0.6);
      expect(cosine.se).toBeLessThan(uniform.se * 1.1);
    });

  it("sees the lamp itself equally bright whatever the strategy", () => {
    const values = [0, 1, 2, 3].map((s) => { const ray = tracer.cameraRay(32, 7, 64, 64, 0.5, 0.5); return tracer.radiance(ray.o, ray.d, streamFor(1, 1), 0, s).rgb[0]; });
    expect(values).toEqual([15, 15, 15, 15]);
  });
});
