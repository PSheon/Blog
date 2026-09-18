import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { preprocess } from "@/content/posts/cnn-from-scratch/components/preprocess";
import { RASTER_SIZE, SAMPLES, rasterize } from "@/content/posts/cnn-from-scratch/components/strokes";
import { MNIST_CNN, Sequential, tensor } from "@/lib/ml";

const { weights } = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../content/posts/cnn-from-scratch/weights.json"), "utf8"),
);
const model = new Sequential(MNIST_CNN, weights);

describe("rasterize", () => {
  it("draws nothing for no strokes", () => {
    expect(rasterize([]).every((v) => v === 0)).toBe(true);
  });

  it("draws a dot for a single-point stroke", () => {
    const ink = rasterize([[[0.5, 0.5]]]);
    expect(ink[(RASTER_SIZE / 2) * RASTER_SIZE + RASTER_SIZE / 2]).toBe(1);
    expect(ink[0]).toBe(0);
  });

  it("survives strokes that leave the canvas", () => {
    expect(() => rasterize([[[-0.2, 0.5], [1.3, 0.5]]])).not.toThrow();
  });
});

describe("strokes → raster → preprocess → model", () => {
  for (const [digit, strokes] of Object.entries(SAMPLES)) {
    it(`reads the sample ${digit} as ${digit}`, () => {
      const input = preprocess(rasterize(strokes), RASTER_SIZE);
      const probs = model.predict(tensor(input, [1, 1, 28, 28]));
      const guess = probs.indexOf(Math.max(...probs));
      expect({ guess, p: Number(probs[guess].toFixed(2)) }).toMatchObject({ guess: Number(digit) });
    });
  }
});
