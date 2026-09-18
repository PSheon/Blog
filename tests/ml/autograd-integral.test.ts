import { describe, expect, it } from "vitest";
import { Mat, Tape, mulberry32 } from "@/lib/ml";

const rng = mulberry32(21);
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

describe("concatRows", () => {
  it("stacks channels and splits the gradient back", () => {
    const a = new Mat(1, 3, Float64Array.from([1, 2, 3])), b = new Mat(2, 3, Float64Array.from([4, 5, 6, 7, 8, 9]));
    const out = new Tape().concatRows([a, b]);
    expect([out.rows, out.cols]).toEqual([3, 3]);
    expect(Array.from(out.data)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const x = rand(2, 5), y = rand(3, 5), probe = rand(5, 5);
    check([x, y], (t) => t.sumProduct(t.concatRows([x, y]), probe));
  });

  it("rejects maps of different sizes", () => {
    expect(() => new Tape().concatRows([rand(1, 4), rand(1, 5)])).toThrow(/columns/);
  });
});

describe("marginal", () => {
  // one channel, 2 rows × 3 columns:  [1 2 3]
  //                                   [4 5 9]
  const x = () => new Mat(1, 6, Float64Array.from([1, 2, 3, 4, 5, 9]));

  it("averages over rows to get one value per column (axis x)", () => {
    const m = new Tape().marginal(x(), { h: 2, w: 3, axis: "x" });
    expect([m.rows, m.cols]).toEqual([1, 3]);
    expect(Array.from(m.data)).toEqual([2.5, 3.5, 6]);
  });

  it("averages over columns to get one value per row (axis y)", () => {
    const m = new Tape().marginal(x(), { h: 2, w: 3, axis: "y" });
    expect([m.rows, m.cols]).toEqual([1, 2]);
    expect(Array.from(m.data)).toEqual([2, 6]);
  });

  it("has correct gradients on both axes, several channels", () => {
    // Probes are fixed outside the function under test: finite differences need f to be deterministic.
    const z = rand(3, 4 * 5), px = rand(3, 5), py = rand(3, 4);
    check([z], (t) => t.sumProduct(t.marginal(z, { h: 4, w: 5, axis: "x" }), px));
    check([z], (t) => t.sumProduct(t.marginal(z, { h: 4, w: 5, axis: "x" }), px) + t.sumProduct(t.marginal(z, { h: 4, w: 5, axis: "y" }), py));
  });
});

describe("softmax (row-wise, unmasked)", () => {
  it("normalises every row and is stable for large logits", () => {
    const p = new Tape().softmax(new Mat(2, 3, Float64Array.from([1, 2, 3, 1000, 1001, 1002])));
    for (const r of [0, 1]) expect(p.data[r * 3] + p.data[r * 3 + 1] + p.data[r * 3 + 2]).toBeCloseTo(1, 12);
    expect(p.data[5]).toBeCloseTo(0.66524, 4);
    expect(Array.from(p.data).some(Number.isNaN)).toBe(false);
  });

  it("has correct gradients", () => {
    const z = rand(3, 6, 2), probe = rand(3, 6);
    check([z], (t) => t.sumProduct(t.softmax(z), probe));
  });
});

describe("l1", () => {
  it("is the mean absolute error, with a gradient of ±1/n", () => {
    const pred = new Mat(1, 4, Float64Array.from([1, 5, 2, 2]));
    const tape = new Tape();
    expect(tape.l1(pred, [0, 3, 4, 2.5])).toBeCloseTo((1 + 2 + 2 + 0.5) / 4, 12);
    tape.backward();
    expect(Array.from(pred.grad)).toEqual([0.25, 0.25, -0.25, -0.25]);
  });

  it("scales only the gradient, like the other losses", () => {
    const pred = new Mat(1, 2, Float64Array.from([3, -1]));
    const tape = new Tape();
    expect(tape.l1(pred, [0, 0], 4)).toBe(2);
    tape.backward();
    expect(Array.from(pred.grad)).toEqual([2, -2]);
  });
});

describe("the integral box head, end to end", () => {
  it("expected edge position = softmax(marginal(map)) · positions, and its gradient is right", () => {
    const h = 4, w = 5;
    const maps = rand(4, h * w, 2); // left, right use axis x; top, bottom use axis y
    const xs = new Mat(w, 1, Float64Array.from({ length: w }, (_, i) => (i + 0.5) / w));
    const ys = new Mat(h, 1, Float64Array.from({ length: h }, (_, i) => (i + 0.5) / h));
    const target = [0.2, 0.8, 0.3, 0.9];
    check([maps], (t) => {
      const lr = t.matmul(t.softmax(t.marginal(t.sliceRows(maps, 0, 2), { h, w, axis: "x" })), xs);
      const tb = t.matmul(t.softmax(t.marginal(t.sliceRows(maps, 2, 2), { h, w, axis: "y" })), ys);
      return t.l1(t.concatRows([lr, tb]), target);
    });
  });
});
