import { describe, expect, it } from "vitest";
import {
  conv2d,
  dense,
  flatten,
  maxPool2d,
  relu,
  softmax,
  tensor,
  zeros,
} from "@/lib/ml";

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("tensor", () => {
  it("throws when data does not match shape", () => {
    expect(() => tensor([1, 2, 3], [2, 2])).toThrow(/shape/);
  });

  it("creates zero tensors", () => {
    const t = zeros([2, 3]);
    expect(t.data.length).toBe(6);
    expect(Array.from(t.data).every((v) => v === 0)).toBe(true);
  });
});

describe("conv2d", () => {
  const x = tensor(range(9), [1, 1, 3, 3]);
  const w = tensor([1, 0, 0, -1], [1, 1, 2, 2]);

  it("cross-correlates without padding", () => {
    const y = conv2d(x, w, null);
    expect(y.shape).toEqual([1, 1, 2, 2]);
    expect(Array.from(y.data)).toEqual([-4, -4, -4, -4]);
  });

  it("adds bias per output channel", () => {
    const y = conv2d(x, w, tensor([1], [1]));
    expect(Array.from(y.data)).toEqual([-3, -3, -3, -3]);
  });

  it("zero-pads the input", () => {
    const y = conv2d(x, w, null, { padding: 1 });
    expect(y.shape).toEqual([1, 1, 4, 4]);
    // top-left window covers only x[0,0] under the kernel's -1 tap
    expect(y.data[0]).toBe(-1);
  });

  it("sums across input channels", () => {
    const x2 = tensor([1, 2, 3, 4, 10, 20, 30, 40], [1, 2, 2, 2]);
    const ones = tensor([1, 1], [1, 2, 1, 1]);
    const y = conv2d(x2, ones, null);
    expect(y.shape).toEqual([1, 1, 2, 2]);
    expect(Array.from(y.data)).toEqual([11, 22, 33, 44]);
  });

  it("supports stride", () => {
    const x4 = tensor(range(16), [1, 1, 4, 4]);
    const ones = tensor([1, 1, 1, 1], [1, 1, 2, 2]);
    const y = conv2d(x4, ones, null, { stride: 2 });
    expect(y.shape).toEqual([1, 1, 2, 2]);
    expect(Array.from(y.data)).toEqual([14, 22, 46, 54]);
  });

  it("rejects mismatched channel counts", () => {
    const bad = tensor([1, 1], [1, 2, 1, 1]);
    expect(() => conv2d(x, bad, null)).toThrow(/channel/);
  });
});

describe("maxPool2d", () => {
  it("pools with stride equal to the window", () => {
    const y = maxPool2d(tensor(range(16), [1, 1, 4, 4]), 2);
    expect(y.shape).toEqual([1, 1, 2, 2]);
    expect(Array.from(y.data)).toEqual([6, 8, 14, 16]);
  });

  it("floors odd sizes", () => {
    const y = maxPool2d(tensor(range(25), [1, 1, 5, 5]), 2);
    expect(y.shape).toEqual([1, 1, 2, 2]);
    expect(Array.from(y.data)).toEqual([7, 9, 17, 19]);
  });
});

describe("relu / flatten / dense", () => {
  it("clamps negatives to zero", () => {
    const y = relu(tensor([-2, 0, 3], [3]));
    expect(Array.from(y.data)).toEqual([0, 0, 3]);
  });

  it("flattens everything after the batch dim", () => {
    expect(flatten(zeros([2, 3, 2, 2])).shape).toEqual([2, 12]);
  });

  it("computes x·Wᵀ + b with PyTorch weight layout", () => {
    const y = dense(
      tensor([1, 2], [1, 2]),
      tensor([1, 2, 3, 4], [2, 2]),
      tensor([10, 20], [2]),
    );
    expect(y.shape).toEqual([1, 2]);
    expect(Array.from(y.data)).toEqual([15, 31]);
  });
});

describe("softmax", () => {
  it("normalises each row", () => {
    const y = softmax(tensor([1, 2, 3, 1, 1, 1], [2, 3]));
    const rows = [y.data.slice(0, 3), y.data.slice(3, 6)];
    for (const r of rows) {
      expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    }
    expect(y.data[3]).toBeCloseTo(1 / 3, 6);
    expect(y.data[2]).toBeGreaterThan(y.data[1]);
  });

  it("is numerically stable for large logits", () => {
    const y = softmax(tensor([1000, 1001, 1002], [1, 3]));
    expect(Array.from(y.data).some(Number.isNaN)).toBe(false);
    expect(y.data[2]).toBeCloseTo(0.66524, 4);
  });
});
