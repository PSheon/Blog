import { describe, expect, it } from "vitest";
import {
  MNIST_CNN,
  Sequential,
  type LayerSpec,
  type Weights,
  tensor,
  zeros,
} from "@/lib/ml";

const tiny: LayerSpec[] = [
  { type: "conv2d", name: "conv1", inC: 1, outC: 1, kernel: 2, padding: 0 },
  { type: "relu", name: "relu1" },
  { type: "flatten", name: "flatten" },
  { type: "dense", name: "fc", inF: 4, outF: 2 },
  { type: "softmax", name: "softmax" },
];

const tinyWeights: Weights = {
  "conv1.weight": { shape: [1, 1, 2, 2], data: [1, 0, 0, -1] },
  "conv1.bias": { shape: [1], data: [5] },
  "fc.weight": { shape: [2, 4], data: [1, 1, 1, 1, 0, 0, 0, 0] },
  "fc.bias": { shape: [2], data: [0, 4] },
};

function zeroWeights(layers: LayerSpec[]): Weights {
  const w: Weights = {};
  for (const l of layers) {
    if (l.type === "conv2d") {
      const shape = [l.outC, l.inC, l.kernel, l.kernel];
      w[`${l.name}.weight`] = { shape, data: Array(shape.reduce((a, b) => a * b)).fill(0) };
      w[`${l.name}.bias`] = { shape: [l.outC], data: Array(l.outC).fill(0) };
    } else if (l.type === "dense") {
      w[`${l.name}.weight`] = { shape: [l.outF, l.inF], data: Array(l.outF * l.inF).fill(0) };
      w[`${l.name}.bias`] = { shape: [l.outF], data: Array(l.outF).fill(0) };
    }
  }
  return w;
}

describe("Sequential", () => {
  it("returns one activation per layer, in order", () => {
    const model = new Sequential(tiny, tinyWeights);
    const acts = model.forward(tensor([1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 1, 3, 3]));
    expect(acts.map((a) => a.name)).toEqual(["conv1", "relu1", "flatten", "fc", "softmax"]);
    expect(acts.map((a) => a.type)).toEqual(["conv2d", "relu", "flatten", "dense", "softmax"]);
    // conv: every window is -4, plus bias 5 → 1
    expect(Array.from(acts[0].output.data)).toEqual([1, 1, 1, 1]);
    expect(acts[2].output.shape).toEqual([1, 4]);
    // fc: [1+1+1+1 + 0, 0 + 4] → equal logits
    expect(Array.from(acts[3].output.data)).toEqual([4, 4]);
    expect(acts[4].output.data[0]).toBeCloseTo(0.5, 6);
  });

  it("predict returns the final activation", () => {
    const model = new Sequential(tiny, tinyWeights);
    const p = model.predict(zeros([1, 1, 3, 3]));
    expect(p.length).toBe(2);
    expect(p[0] + p[1]).toBeCloseTo(1, 6);
  });

  it("names the missing weight key", () => {
    const { ["conv1.bias"]: _omit, ...rest } = tinyWeights;
    void _omit;
    expect(() => new Sequential(tiny, rest)).toThrow(/conv1\.bias/);
  });

  it("rejects mis-shaped weights", () => {
    const bad: Weights = {
      ...tinyWeights,
      "fc.weight": { shape: [4, 2], data: tinyWeights["fc.weight"].data },
    };
    expect(() => new Sequential(tiny, bad)).toThrow(/fc\.weight.*\[2, 4\]/);
  });

  it("MNIST_CNN produces the documented shapes", () => {
    const model = new Sequential(MNIST_CNN, zeroWeights(MNIST_CNN));
    const acts = model.forward(zeros([1, 1, 28, 28]));
    expect(acts.map((a) => a.output.shape)).toEqual([
      [1, 8, 28, 28],
      [1, 8, 28, 28],
      [1, 8, 14, 14],
      [1, 16, 14, 14],
      [1, 16, 14, 14],
      [1, 16, 7, 7],
      [1, 784],
      [1, 10],
      [1, 10],
    ]);
    for (const p of acts[8].output.data) expect(p).toBeCloseTo(0.1, 6);
  });
});
