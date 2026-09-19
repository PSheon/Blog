import { describe, expect, it } from "vitest";
import { ALPHA_BAR, DIMS, PointDiffusion, T, gaussian, schedule } from "@/content/posts/diffusion-points/components/diffusion";
import { SHAPES } from "@/content/posts/diffusion-points/components/shapes";
import { mulberry32 } from "@/lib/ml";

/** Mean distance from each point of `a` to its nearest neighbour in `b`, over the first `dims` coordinates. */
function nearest(a: Float64Array, b: Float64Array, dims: number) {
  let sum = 0;
  for (let i = 0; i < a.length; i += DIMS) {
    let best = Infinity;
    for (let j = 0; j < b.length; j += DIMS) {
      let d = 0;
      for (let k = 0; k < dims; k++) d += (a[i + k] - b[j + k]) ** 2;
      if (d < best) best = d;
    }
    sum += Math.sqrt(best);
  }
  return sum / (a.length / DIMS);
}

describe("noise schedule", () => {
  it("keeps everything at level 0, nothing at level T, and only ever loses signal in between", () => {
    expect(ALPHA_BAR[0]).toBe(1);
    expect(ALPHA_BAR[T]).toBeLessThan(1e-3);
    for (let t = 1; t <= T; t++) expect(ALPHA_BAR[t]).toBeLessThan(ALPHA_BAR[t - 1]);
  });

  it("samples from T down to 0 without repeating a level", () => {
    const levels = schedule(40);
    expect(levels[0]).toBe(T);
    expect(levels[40]).toBe(0);
    for (let k = 1; k < levels.length; k++) expect(levels[k]).toBeLessThan(levels[k - 1]);
  });
});

describe("fruit", () => {
  it.each(Object.entries(SHAPES))("%s stays inside the unit box and uses valid colours", (_, shape) => {
    const rng = mulberry32(3);
    for (let i = 0; i < 2000; i++) {
      const p = shape(rng);
      expect(p).toHaveLength(DIMS);
      for (const v of p) expect(Math.abs(v)).toBeLessThanOrEqual(1.05);
    }
  });
});

describe("PointDiffusion", () => {
  it("learns two fruit and grows the one it is asked for", () => {
    const rng = mulberry32(1), shapes = [SHAPES.apple, SHAPES.banana], net = new PointDiffusion(2, 48, rng);
    expect(net.parameterCount).toBe((DIMS + 18 + 8 + 2) * 48 + 48 + 2 * (48 * 48 + 48) + 48 * DIMS + DIMS);
    for (let i = 0; i < 40; i++) net.train(shapes, 128);
    const early = net.loss;
    for (let i = 0; i < 1500; i++) net.train(shapes, 128);
    expect(net.loss).toBeLessThan(early * 0.6);

    const N = 300, cloud = Float64Array.from({ length: 2 * N * DIMS }, () => gaussian(rng)), levels = schedule(30);
    for (let k = 0; k < 30; k++) net.denoise(cloud, levels[k], levels[k + 1], (i) => (i < N ? [1, 0] : [0, 1]));
    const truth = shapes.map((shape) => { const out = new Float64Array(600 * DIMS); for (let i = 0; i < 600; i++) out.set(shape(rng), i * DIMS); return out; });
    const asApple = cloud.subarray(0, N * DIMS), asBanana = cloud.subarray(N * DIMS);
    // Each half ends up nearer its own fruit than the other one, in position and in all six dimensions.
    for (const dims of [3, DIMS]) {
      expect(nearest(asApple, truth[0], dims)).toBeLessThan(nearest(asApple, truth[1], dims));
      expect(nearest(asBanana, truth[1], dims)).toBeLessThan(nearest(asBanana, truth[0], dims));
    }
    // …and far nearer than the noise it started from (a unit Gaussian sits about 1 away from a fruit's surface).
    // (1,500 small steps with a 48-wide network, and one point in ten trained without being told its fruit.)
    expect(nearest(asApple, truth[0], 3)).toBeLessThan(0.25);
    expect(nearest(asBanana, truth[1], 3)).toBeLessThan(0.25);
  }, 120_000);

  it("guesses the finished fruit better from less noise, and guidance of 1 changes nothing", () => {
    const rng = mulberry32(2), shapes = [SHAPES.strawberry, SHAPES.pear], net = new PointDiffusion(2, 48, rng);
    for (let i = 0; i < 1200; i++) net.train(shapes, 128);
    const N = 400, clean = new Float64Array(N * DIMS), noise = Float64Array.from({ length: N * DIMS }, () => gaussian(rng));
    for (let i = 0; i < N; i++) clean.set(shapes[0](rng), i * DIMS);
    const error = (level: number) => {
      const x = clean.map((v, i) => Math.sqrt(ALPHA_BAR[level]) * v + Math.sqrt(1 - ALPHA_BAR[level]) * noise[i]), g = net.guess(x, level, () => [1, 0]);
      return Math.sqrt(g.reduce((sum, v, i) => sum + (v - clean[i]) ** 2, 0) / g.length);
    };
    expect(error(10)).toBeLessThan(error(50));
    expect(error(50)).toBeLessThan(error(90));
    const x = Float64Array.from({ length: 60 * DIMS }, () => gaussian(rng));
    expect(Array.from(net.noiseIn(x, 60, () => [1, 0], 1))).toEqual(Array.from(net.noiseIn(x, 60, () => [1, 0])));
    expect(Array.from(net.noiseIn(x, 60, () => [1, 0], 3))).not.toEqual(Array.from(net.noiseIn(x, 60, () => [1, 0])));
  }, 120_000);
});
