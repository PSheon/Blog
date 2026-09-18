import { describe, expect, it } from "vitest";
import { Mat, Tape, conv2d as referenceConv, mulberry32, tensor } from "@/lib/ml";

const rng = mulberry32(7);
const rand = (rows: number, cols: number, scale = 1) =>
  new Mat(rows, cols, Float64Array.from({ length: rows * cols }, () => (rng() * 2 - 1) * scale));

function check(inputs: Mat[], build: (tape: Tape) => number, tol = 1e-6) {
  const eps = 1e-5;
  inputs.forEach((m) => m.grad.fill(0));
  const tape = new Tape();
  build(tape);
  tape.backward();
  for (const m of inputs) {
    const analytic = Float64Array.from(m.grad);
    for (let i = 0; i < m.data.length; i++) {
      const keep = m.data[i];
      m.data[i] = keep + eps;
      const up = build(new Tape());
      m.data[i] = keep - eps;
      const down = build(new Tape());
      m.data[i] = keep;
      expect(Math.abs(analytic[i] - (up - down) / (2 * eps)), `grad[${i}]`).toBeLessThan(tol);
    }
  }
}

// Feature maps are stored as Mat(channels, height·width).
const H = 5, W = 4;

describe("conv2d", () => {
  it("matches the inference implementation in ops.ts", () => {
    const x = rand(2, H * W), w = rand(3, 2 * 9), b = rand(1, 3);
    const got = new Tape().conv2d(x, w, b, { h: H, w: W, k: 3 });
    const want = referenceConv(
      tensor(Float32Array.from(x.data), [1, 2, H, W]),
      tensor(Float32Array.from(w.data), [3, 2, 3, 3]),
      tensor(Float32Array.from(b.data), [3]),
      { padding: 1 },
    );
    expect(got.rows).toBe(3);
    expect(got.cols).toBe(H * W);
    got.data.forEach((v, i) => expect(v).toBeCloseTo(want.data[i], 5));
  });

  it("has correct gradients for input, kernel and bias", () => {
    const x = rand(2, H * W), w = rand(3, 2 * 9), b = rand(1, 3), probe = rand(3, H * W);
    check([x, w, b], (t) => t.sumProduct(t.conv2d(x, w, b, { h: H, w: W, k: 3 }), probe));
  });

  it("supports 1×1 kernels (used by the heads)", () => {
    const x = rand(4, H * W), w = rand(2, 4), b = rand(1, 2), probe = rand(2, H * W);
    check([x, w, b], (t) => t.sumProduct(t.conv2d(x, w, b, { h: H, w: W, k: 1 }), probe));
  });

  it("rejects a kernel that does not match the input channels", () => {
    expect(() => new Tape().conv2d(rand(2, H * W), rand(3, 5 * 9), rand(1, 3), { h: H, w: W, k: 3 })).toThrow(/channels/);
  });
});

describe("maxPool2 / upsample2", () => {
  it("pools 2×2 and routes the gradient to the winner only", () => {
    const x = new Mat(1, 16, Float64Array.from([1, 2, 5, 6, 3, 4, 7, 8, 9, 10, 13, 14, 11, 12, 15, 16]));
    const tape = new Tape();
    const y = tape.maxPool2(x, { h: 4, w: 4 });
    expect(Array.from(y.data)).toEqual([4, 8, 12, 16]);
    tape.sumProduct(y, new Mat(1, 4, Float64Array.from([1, 10, 100, 1000])));
    tape.backward();
    expect(Array.from(x.grad)).toEqual([0, 0, 0, 0, 0, 1, 0, 10, 0, 0, 0, 0, 0, 100, 0, 1000]);
  });

  it("maxPool2 gradients match finite differences", () => {
    const x = rand(2, 6 * 4), probe = rand(2, 3 * 2);
    check([x], (t) => t.sumProduct(t.maxPool2(x, { h: 6, w: 4 }), probe));
  });

  it("upsample2 repeats each pixel into a 2×2 block, and sums gradients back", () => {
    const x = new Mat(1, 4, Float64Array.from([1, 2, 3, 4]));
    const y = new Tape().upsample2(x, { h: 2, w: 2 });
    expect(Array.from(y.data)).toEqual([1, 1, 2, 2, 1, 1, 2, 2, 3, 3, 4, 4, 3, 3, 4, 4]);
    const z = rand(2, 3 * 2), probe = rand(2, 6 * 4);
    check([z], (t) => t.sumProduct(t.upsample2(z, { h: 3, w: 2 }), probe));
  });
});

describe("losses", () => {
  it("bceWithLogits equals the textbook formula and is stable for large logits", () => {
    const tape = new Tape();
    const logits = new Mat(1, 3, Float64Array.from([0, 800, -800]));
    const loss = tape.bceWithLogits(logits, [1, 1, 0]);
    expect(loss).toBeCloseTo(Math.log(2) / 3, 10);
    expect(Number.isFinite(loss)).toBe(true);
  });

  it("bceWithLogits gradients, with per-element weights", () => {
    const logits = rand(2, 6, 2);
    const targets = [1, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1];
    const weights = [1, 1, 0, 2, 1, 0.5, 1, 1, 1, 0, 3, 1];
    check([logits], (t) => t.bceWithLogits(logits, targets, weights));
  });

  it("mse only counts masked-in elements", () => {
    const pred = new Mat(1, 4, Float64Array.from([1, 2, 3, 4]));
    expect(new Tape().mse(pred, [0, 0, 0, 0], [1, 0, 0, 1])).toBeCloseTo((1 + 16) / 2, 10);
    const p = rand(2, 5);
    check([p], (t) => t.mse(p, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1], [1, 0, 1, 1, 0, 1, 1, 0, 0, 1]));
  });

  it("losses add up: two heads can share one backward pass", () => {
    const x = rand(2, 6);
    check([x], (t) => t.bceWithLogits(x, [1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1]) + 0.5 * t.mse(x, new Array(12).fill(0.25), undefined, 0.5));
  });
});
