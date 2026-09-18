import { describe, expect, it } from "vitest";
import { preprocess } from "@/content/posts/cnn-from-scratch/components/preprocess";

const SRC = 280;

function blank(): Float32Array {
  return new Float32Array(SRC * SRC);
}

function fillRect(img: Float32Array, x0: number, y0: number, w: number, h: number, v = 1) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) img[y * SRC + x] = v;
}

function centreOfMass(img: Float32Array, n: number) {
  let m = 0, cx = 0, cy = 0;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const v = img[y * n + x];
      m += v; cx += v * (x + 0.5); cy += v * (y + 0.5);
    }
  return { x: cx / m, y: cy / m, mass: m };
}

function bbox(img: Float32Array, n: number) {
  let x0 = n, y0 = n, x1 = -1, y1 = -1;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (img[y * n + x] > 0.05) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
  return { w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

describe("preprocess", () => {
  it("returns zeros for an empty canvas", () => {
    const out = preprocess(blank(), SRC);
    expect(out.length).toBe(784);
    expect(out.every((v) => v === 0)).toBe(true);
  });

  it("centres an off-centre blob by its centre of mass", () => {
    const img = blank();
    fillRect(img, 10, 180, 60, 90);
    const c = centreOfMass(preprocess(img, SRC), 28);
    // Placement is whole-pixel (as in MNIST itself), so half a pixel is the tightest bound.
    expect(Math.abs(c.x - 14)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(c.y - 14)).toBeLessThanOrEqual(0.5);
  });

  it("scales the longest side of the ink to 20 px, keeping aspect ratio", () => {
    const img = blank();
    fillRect(img, 100, 20, 40, 240); // tall stroke, 1:6
    const b = bbox(preprocess(img, SRC), 28);
    expect(Math.abs(b.h - 20)).toBeLessThanOrEqual(1);
    expect(b.w).toBeLessThanOrEqual(5);
    expect(b.w).toBeGreaterThanOrEqual(3);
  });

  it("scales small drawings up", () => {
    const img = blank();
    fillRect(img, 130, 130, 20, 20);
    const b = bbox(preprocess(img, SRC), 28);
    expect(Math.abs(b.w - 20)).toBeLessThanOrEqual(1);
  });

  it("keeps values within [0, 1]", () => {
    const img = blank();
    fillRect(img, 40, 40, 200, 200);
    const out = preprocess(img, SRC);
    expect(Math.max(...out)).toBeLessThanOrEqual(1);
    expect(Math.min(...out)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...out)).toBeGreaterThan(0.9);
  });

  it("is not thrown off-grid by ink touching the canvas edge", () => {
    const img = blank();
    fillRect(img, 0, 0, 280, 30);
    const out = preprocess(img, SRC);
    expect(out.length).toBe(784);
    expect(centreOfMass(out, 28).mass).toBeGreaterThan(0);
  });
});
