import { describe, expect, it } from "vitest";
import { Mat, type TapList, Tape, mulberry32 } from "@/lib/ml";

const rng = mulberry32(11);
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

const H = 4, W = 5;
const taps: TapList = {
  src: Int32Array.from([0, 0, 1, 1, 0]),
  dst: Int32Array.from([0, 1, 1, 2, 2]),
  dr: Int32Array.from([0, 1, -1, 0, 2]),
  dc: Int32Array.from([0, -1, 1, -2, 0]),
  weight: Float64Array.from([0.7, -0.4, 1.3, -0.9, 0.2]),
  pair: Int32Array.from([0, 1, 2, 3, 3]),
};

describe("tapConv", () => {
  it("reads the source cell at the tap's offset, scaled by the pair's gain, and treats the outside as silent", () => {
    const x = new Mat(2, H * W);
    x.data[0 * H * W + 2 * W + 1] = 1; // channel 0, row 2, col 1
    const logGains = new Mat(1, 4, Float64Array.from([0, Math.log(2), 0, 0]));
    const out = new Tape().tapConv(x, logGains, taps, { h: H, w: W, cOut: 3 });
    expect(out.data[0 * H * W + 2 * W + 1]).toBeCloseTo(0.7); // tap 0: same place
    expect(out.data[1 * H * W + 1 * W + 2]).toBeCloseTo(-0.8); // tap 1: target at (1,2) hears source at (2,1); gain 2
    expect(out.data[2 * H * W + 0 * W + 1]).toBeCloseTo(0.2); // tap 4: target at (0,1) hears (2,1)
    expect(out.data.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0)).toBe(3);
  });

  it("has correct gradients for the input and the log-gains", () => {
    const x = rand(2, H * W), logGains = rand(1, 4, 0.5), probe = rand(3, H * W);
    check([x, logGains], (t) => t.sumProduct(t.tapConv(x, logGains, taps, { h: H, w: W, cOut: 3 }), probe));
  });
});

describe("leak", () => {
  it("moves each channel a fraction dt/τ of the way to drive + rest", () => {
    const v = new Mat(1, 2, Float64Array.from([1, 0])), drive = new Mat(1, 2, Float64Array.from([0, 1]));
    const out = new Tape().leak(v, drive, new Mat(1, 1, Float64Array.from([Math.log(0.1)])), new Mat(1, 1, Float64Array.from([0.5])), 0.02);
    expect(out.data[0]).toBeCloseTo(1 + 0.2 * (0.5 - 1));
    expect(out.data[1]).toBeCloseTo(0.2 * 1.5);
  });

  it("has correct gradients for state, drive, log τ and rest", () => {
    const v = rand(3, 6), drive = rand(3, 6), logTau = new Mat(1, 3, Float64Array.from([Math.log(0.05), Math.log(0.2), Math.log(0.03)])), rest = rand(1, 3), probe = rand(3, 6);
    check([v, drive, logTau, rest], (t) => t.sumProduct(t.leak(v, drive, logTau, rest, 0.02), probe));
  });

  it("clamps τ at dt and then sends no gradient to it", () => {
    const v = rand(1, 4), drive = rand(1, 4), logTau = new Mat(1, 1, Float64Array.from([Math.log(0.001)])), rest = rand(1, 1), probe = rand(1, 4);
    const t = new Tape(), out = t.leak(v, drive, logTau, rest, 0.02);
    out.data.forEach((o, i) => expect(o).toBeCloseTo(drive.data[i] + rest.data[0]));
    t.sumProduct(out, probe);
    t.backward();
    expect(logTau.grad[0]).toBe(0);
  });
});

describe("meanRows", () => {
  it("averages each channel over the chosen cells, with correct gradients", () => {
    const x = rand(3, 8), cells = [1, 4, 6], probe = rand(1, 3);
    const out = new Tape().meanRows(x, cells);
    expect(out.data[2]).toBeCloseTo((x.data[17] + x.data[20] + x.data[22]) / 3);
    check([x], (t) => t.sumProduct(t.meanRows(x, cells), probe));
    check([x], (t) => t.sumProduct(t.meanRows(x), probe));
  });
});
