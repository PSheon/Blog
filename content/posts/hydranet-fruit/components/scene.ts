import type { Rng } from "@/lib/ml";

/** Network input is SIZE×SIZE RGB; the mask is predicted at half that resolution. */
export const SIZE = 32;
export const MASK = 16;

export interface Scene {
  /** [3, SIZE·SIZE], channel-first, values in 0..1. */
  image: Float64Array;
  /** MASK×MASK, 0 or 1. */
  mask: Float64Array;
  /** Left, right, top, bottom edges as fractions of the image side. */
  box: [left: number, right: number, top: number, bottom: number];
}

/**
 * Turn an alpha map into both labels. One threshold decides what counts as "object" for the box
 * and for the mask, so the two annotations can never disagree. This is why the data is free:
 * whatever drew the object (an emoji glyph, a shape) already knows where it is.
 */
export function annotate(alpha: ArrayLike<number>): Pick<Scene, "mask" | "box"> | null {
  let x0 = SIZE, y0 = SIZE, x1 = -1, y1 = -1;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (alpha[y * SIZE + x] < 0.5) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;

  const r = SIZE / MASK;
  const mask = new Float64Array(MASK * MASK);
  for (let my = 0; my < MASK; my++) {
    for (let mx = 0; mx < MASK; mx++) {
      let inside = 0;
      for (let dy = 0; dy < r; dy++) for (let dx = 0; dx < r; dx++) if (alpha[(my * r + dy) * SIZE + mx * r + dx] >= 0.5) inside++;
      mask[my * MASK + mx] = inside * 2 >= r * r ? 1 : 0;
    }
  }
  return { mask, box: [x0 / SIZE, (x1 + 1) / SIZE, y0 / SIZE, (y1 + 1) / SIZE] };
}

/** A noisy two-tone gradient: enough clutter that "anything not flat" is not a solution. */
export function background(rng: Rng): Float64Array {
  const image = new Float64Array(3 * SIZE * SIZE);
  const base = [rng(), rng(), rng()], tiltX = rng() - 0.5, tiltY = rng() - 0.5;
  for (let c = 0; c < 3; c++)
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        const v = base[c] * 0.6 + 0.2 + tiltX * (x / SIZE) + tiltY * (y / SIZE) + (rng() - 0.5) * 0.12;
        image[c * SIZE * SIZE + y * SIZE + x] = v < 0 ? 0 : v > 1 ? 1 : v;
      }
  return image;
}

/** Paint premultiplied-free RGBA pixels over a background and label the result. */
export function compose(bg: Float64Array, rgb: ArrayLike<number>, alpha: ArrayLike<number>): Scene | null {
  const labels = annotate(alpha);
  if (!labels) return null;
  const image = Float64Array.from(bg), n = SIZE * SIZE;
  for (let i = 0; i < n; i++) {
    const a = alpha[i];
    if (a === 0) continue;
    for (let c = 0; c < 3; c++) image[c * n + i] = image[c * n + i] * (1 - a) + rgb[c * n + i] * a;
  }
  return { image, ...labels };
}

/**
 * Coloured discs, boxes and triangles. They stand in for emoji in Node (tests, benchmarks),
 * and in the browser when the system has no colour emoji font.
 */
export function shapeScene(rng: Rng): Scene {
  for (;;) {
    const kind = Math.floor(rng() * 3);
    const rx = 4 + rng() * 7, ry = rx * (0.7 + rng() * 0.6);
    const cx = rx + rng() * (SIZE - 2 * rx), cy = ry + rng() * (SIZE - 2 * ry);
    const colour = [rng(), rng(), rng()];
    colour[Math.floor(rng() * 3)] = 0.85 + rng() * 0.15; // keep it saturated enough to be findable
    const n = SIZE * SIZE, rgb = new Float64Array(3 * n), alpha = new Float64Array(n);
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
        const inside = kind === 0 ? u * u + v * v <= 1 : kind === 1 ? Math.abs(u) <= 1 && Math.abs(v) <= 1 : Math.abs(v) <= 1 && Math.abs(u) <= (v + 1) / 2;
        if (!inside) continue;
        alpha[y * SIZE + x] = 1;
        for (let c = 0; c < 3; c++) rgb[c * n + y * SIZE + x] = colour[c];
      }
    const scene = compose(background(rng), rgb, alpha);
    if (scene) return scene;
  }
}

export function boxIoU(a: Scene["box"], b: Scene["box"]): number {
  const iw = Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
  const ih = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[2], b[2]));
  const union = (a[1] - a[0]) * (a[3] - a[2]) + (b[1] - b[0]) * (b[3] - b[2]) - iw * ih;
  return union > 0 ? (iw * ih) / union : 0;
}

export function maskIoU(logits: ArrayLike<number>, target: ArrayLike<number>): number {
  let inter = 0, union = 0;
  for (let i = 0; i < target.length; i++) {
    const p = logits[i] > 0 ? 1 : 0;
    inter += p * target[i];
    union += Math.max(p, target[i]);
  }
  return union ? inter / union : 1;
}
