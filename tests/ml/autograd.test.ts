import { describe, expect, it } from "vitest";
import { Mat, Tape, mulberry32 } from "@/lib/ml";

const rng = mulberry32(42);
const rand = (rows: number, cols: number, scale = 1) =>
  new Mat(rows, cols, Float64Array.from({ length: rows * cols }, () => (rng() * 2 - 1) * scale));

/**
 * Compare analytic gradients with central differences. `build` must construct the whole
 * computation from `inputs` on the given tape and return a scalar loss.
 */
function check(inputs: Mat[], build: (tape: Tape) => number, eps = 1e-5, tol = 1e-6) {
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
      const numeric = (up - down) / (2 * eps);
      expect(Math.abs(analytic[i] - numeric), `grad[${i}] analytic ${analytic[i]} vs numeric ${numeric}`).toBeLessThan(tol);
    }
  }
}

/** Turn any matrix into a scalar with fixed random weights, so every output entry matters. */
function weightedSum(tape: Tape, m: Mat, w: Mat): number {
  return tape.sumProduct(m, w);
}

describe("Mat", () => {
  it("rejects data of the wrong size", () => {
    expect(() => new Mat(2, 2, new Float64Array(3))).toThrow(/2×2/);
  });
});

describe("Tape gradients match finite differences", () => {
  it("matmul", () => {
    const a = rand(3, 4), b = rand(4, 2), w = rand(3, 2);
    check([a, b], (t) => weightedSum(t, t.matmul(a, b), w));
  });

  it("add and addRow", () => {
    const a = rand(3, 4), b = rand(3, 4), bias = rand(1, 4), w = rand(3, 4);
    check([a, b, bias], (t) => weightedSum(t, t.addRow(t.add(a, b), bias), w));
  });

  it("scale and transpose", () => {
    const a = rand(3, 4), w = rand(4, 3);
    check([a], (t) => weightedSum(t, t.transpose(t.scale(a, 0.37)), w));
  });

  it("relu", () => {
    const a = rand(4, 4), w = rand(4, 4);
    check([a], (t) => weightedSum(t, t.relu(a), w));
  });

  it("layerNorm, including gain and bias", () => {
    const x = rand(3, 6), g = rand(1, 6), b = rand(1, 6), w = rand(3, 6);
    check([x, g, b], (t) => weightedSum(t, t.layerNorm(x, g, b), w), 1e-5, 1e-5);
  });

  it("causal softmax", () => {
    const s = rand(4, 4, 2), w = rand(4, 4);
    check([s], (t) => weightedSum(t, t.causalSoftmax(s), w));
  });

  it("sliceCols and concatCols", () => {
    const a = rand(3, 6), w = rand(3, 6);
    check([a], (t) => {
      const left = t.sliceCols(a, 0, 2), right = t.sliceCols(a, 2, 4);
      return weightedSum(t, t.concatCols([t.scale(right, 2), left]), w);
    });
  });

  it("embed accumulates gradient for repeated ids", () => {
    const table = rand(5, 3), w = rand(4, 3);
    check([table], (t) => weightedSum(t, t.embed(table, [1, 3, 1, 0]), w));
  });

  it("crossEntropy, ignoring masked targets", () => {
    const logits = rand(4, 5, 2);
    check([logits], (t) => t.crossEntropy(logits, [2, -1, 0, 4]));
  });
});

describe("Tape forward values", () => {
  it("causalSoftmax never looks ahead and each row sums to 1", () => {
    const p = new Tape().causalSoftmax(rand(4, 4, 3));
    for (let i = 0; i < 4; i++) {
      let sum = 0;
      for (let j = 0; j < 4; j++) {
        if (j > i) expect(p.data[i * 4 + j]).toBe(0);
        sum += p.data[i * 4 + j];
      }
      expect(sum).toBeCloseTo(1, 10);
    }
  });

  it("layerNorm gives zero mean and unit variance per row", () => {
    const y = new Tape().layerNorm(rand(2, 8, 5), new Mat(1, 8, new Float64Array(8).fill(1)), new Mat(1, 8));
    for (let r = 0; r < 2; r++) {
      const row = Array.from(y.data.subarray(r * 8, r * 8 + 8));
      const mean = row.reduce((a, b) => a + b, 0) / 8;
      const variance = row.reduce((a, b) => a + (b - mean) ** 2, 0) / 8;
      expect(mean).toBeCloseTo(0, 8);
      expect(variance).toBeCloseTo(1, 3);
    }
  });

  it("crossEntropy of uniform logits is ln(classes)", () => {
    expect(new Tape().crossEntropy(new Mat(3, 7), [0, 3, 6])).toBeCloseTo(Math.log(7), 10);
  });
});
