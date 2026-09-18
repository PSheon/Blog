import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MNIST_CNN, Sequential, tensor } from "@/lib/ml";

const root = path.join(__dirname, "../..");
const { weights, accuracy } = JSON.parse(
  fs.readFileSync(path.join(root, "content/posts/cnn-from-scratch/weights.json"), "utf8"),
);
const golden = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/mnist-golden.json"), "utf8"));

describe("MNIST CNN against PyTorch", () => {
  const model = new Sequential(MNIST_CNN, weights);
  const acts = model.forward(tensor(golden.input, [1, 1, 28, 28]));

  it("ships weights that met the accuracy target", () => {
    expect(accuracy).toBeGreaterThanOrEqual(0.98);
  });

  it("reproduces PyTorch's logits", () => {
    const logits = acts[acts.length - 2].output.data;
    golden.logits.forEach((v: number, i: number) => expect(Math.abs(logits[i] - v)).toBeLessThan(1e-4));
  });

  it("reproduces PyTorch's probabilities and picks the right digit", () => {
    const probs = acts[acts.length - 1].output.data;
    golden.probs.forEach((v: number, i: number) => expect(Math.abs(probs[i] - v)).toBeLessThan(1e-4));
    expect(probs.indexOf(Math.max(...probs))).toBe(golden.label);
  });
});
