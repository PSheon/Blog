import { describe, expect, it } from "vitest";
import { HydraNet } from "@/content/posts/hydranet-fruit/components/model";
import { MASK, SIZE, annotate, background, boxIoU, compose, maskIoU, shapeScene } from "@/content/posts/hydranet-fruit/components/scene";
import { mulberry32 } from "@/lib/ml";

const blank = () => new Float64Array(SIZE * SIZE);
function rect(alpha: Float64Array, x0: number, y0: number, x1: number, y1: number, value = 1) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) alpha[y * SIZE + x] = value;
  return alpha;
}

describe("annotate", () => {
  it("returns null when nothing is opaque enough", () => {
    expect(annotate(blank())).toBeNull();
    expect(annotate(rect(blank(), 4, 4, 20, 20, 0.4))).toBeNull();
  });

  it("derives the box and the mask from the same threshold", () => {
    const labels = annotate(rect(blank(), 8, 4, 24, 12))!;
    expect(labels.box).toEqual([8 / 32, 24 / 32, 4 / 32, 12 / 32]);
    // 16×8 px → 8×4 mask cells
    expect(labels.mask.reduce((a, b) => a + b, 0)).toBe(32);
    expect(labels.mask[2 * MASK + 4]).toBe(1);
    expect(labels.mask[1 * MASK + 4]).toBe(0);
  });

  it("ignores a soft, anti-aliased fringe below 0.5 alpha", () => {
    const alpha = rect(rect(blank(), 6, 6, 26, 26, 0.3), 8, 8, 24, 24, 1);
    expect(annotate(alpha)!.box).toEqual([0.25, 0.75, 0.25, 0.75]);
  });

  it("marks a mask cell only when at least half of it is covered", () => {
    expect(annotate(rect(blank(), 10, 10, 11, 12))!.mask.reduce((a, b) => a + b, 0)).toBe(1); // 2 of 4 px
    expect(annotate(rect(blank(), 10, 10, 11, 11))!.mask.reduce((a, b) => a + b, 0)).toBe(0); // 1 of 4 px
  });
});

describe("compose / shapeScene", () => {
  it("blends the object over the background by alpha", () => {
    const bg = new Float64Array(3 * SIZE * SIZE).fill(0.2), rgb = new Float64Array(3 * SIZE * SIZE).fill(1);
    const scene = compose(bg, rgb, rect(blank(), 0, 0, 16, 16, 0.5))!;
    expect(scene.image[0]).toBeCloseTo(0.6, 10);
    expect(scene.image[SIZE * SIZE - 1]).toBeCloseTo(0.2, 10);
  });

  it("generates valid, reproducible scenes", () => {
    const a = shapeScene(mulberry32(5)), b = shapeScene(mulberry32(5));
    expect(Array.from(a.image)).toEqual(Array.from(b.image));
    expect(a.image.length).toBe(3 * SIZE * SIZE);
    expect(a.mask.length).toBe(MASK * MASK);
    expect(a.box[0]).toBeLessThan(a.box[1]);
    expect(a.box[2]).toBeLessThan(a.box[3]);
    expect(Math.min(...a.image)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...a.image)).toBeLessThanOrEqual(1);
    expect(background(mulberry32(1)).length).toBe(3 * SIZE * SIZE);
  });
});

describe("metrics", () => {
  it("boxIoU", () => {
    expect(boxIoU([0, 0.5, 0, 0.5], [0, 0.5, 0, 0.5])).toBe(1);
    expect(boxIoU([0, 0.5, 0, 0.5], [0.5, 1, 0.5, 1])).toBe(0);
    expect(boxIoU([0, 0.5, 0, 1], [0.25, 0.75, 0, 1])).toBeCloseTo(1 / 3, 10);
  });
  it("maskIoU thresholds logits at zero", () => {
    expect(maskIoU([5, -5, 5, -5], [1, 0, 0, 0])).toBe(0.5);
    expect(maskIoU([-1, -1], [0, 0])).toBe(1);
  });
});

describe("HydraNet", () => {
  it("builds only the heads it was asked for", () => {
    const scene = shapeScene(mulberry32(1));
    const boxOnly = new HydraNet({ heads: "box", skip: "slim", boxWeight: 1 }, mulberry32(1)).predict(scene.image);
    expect(boxOnly.edges).toHaveLength(4);
    expect(boxOnly.mask.every((v) => v === 0)).toBe(true);
    const maskOnly = new HydraNet({ heads: "mask", skip: "slim", boxWeight: 1 }, mulberry32(1)).predict(scene.image);
    expect(maskOnly.edges).toHaveLength(0);
  });

  it("predicts edges as distributions, so an untrained box is already inside the image", () => {
    const p = new HydraNet(undefined, mulberry32(2)).predict(shapeScene(mulberry32(3)).image);
    for (const edge of p.edges) expect(edge.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    for (const v of p.box) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("learns boxes and masks together", () => {
    const rng = mulberry32(1), net = new HydraNet(undefined, rng);
    const test = Array.from({ length: 120 }, ((r) => () => shapeScene(r))(mulberry32(99)));
    const before = net.evaluate(test);
    while (net.seen < 4000) net.step(Array.from({ length: 8 }, () => shapeScene(rng)));
    const after = net.evaluate(test);
    expect(before.box).toBeLessThan(0.35);
    expect(after.box).toBeGreaterThan(0.6);
    expect(after.mask).toBeGreaterThan(0.45);
  }, 60_000);

  it("trains identically whether a batch arrives whole or one image at a time", () => {
    const make = () => new HydraNet({ heads: "both", skip: "slim", boxWeight: 1 }, mulberry32(5));
    const whole = make(), piecewise = make(), rng = mulberry32(6);
    for (let step = 0; step < 5; step++) {
      const batch = Array.from({ length: 8 }, () => shapeScene(rng));
      const a = whole.step(batch);
      let b: ReturnType<HydraNet["feed"]> = null;
      for (const scene of batch) b = piecewise.feed(scene, 8);
      expect(b).toEqual(a);
    }
    expect(piecewise.seen).toBe(whole.seen);
    const probe = shapeScene(rng);
    expect(Array.from(piecewise.predict(probe.image).mask)).toEqual(Array.from(whole.predict(probe.image).mask));
  });
});
