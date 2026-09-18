const OUT = 28;
const BOX = 20;
const INK = 0.05;

/**
 * Turn a canvas drawing into the 28×28 image the network was trained on.
 *
 * MNIST digits are size-normalised into a 20×20 box, then placed in a 28×28 frame
 * so their centre of mass sits at the centre. A classifier trained on that is lost
 * when a digit is drawn small in a corner, so we apply the same recipe here.
 *
 * @param ink   srcSize×srcSize ink values in [0, 1] (1 = full stroke)
 * @returns     784 values in [0, 1], row-major
 */
export function preprocess(ink: Float32Array, srcSize: number): Float32Array {
  const out = new Float32Array(OUT * OUT);

  // 1. Bounding box of the ink.
  let x0 = srcSize, y0 = srcSize, x1 = -1, y1 = -1;
  for (let y = 0; y < srcSize; y++) {
    for (let x = 0; x < srcSize; x++) {
      if (ink[y * srcSize + x] > INK) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return out;

  // 2. Scale so the longest side becomes 20 px, by averaging the source area under each pixel.
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const scale = BOX / Math.max(bw, bh);
  const w = Math.max(1, Math.round(bw * scale));
  const h = Math.max(1, Math.round(bh * scale));
  const small = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy0 = y0 + (y * bh) / h;
    const sy1 = y0 + ((y + 1) * bh) / h;
    for (let x = 0; x < w; x++) {
      const sx0 = x0 + (x * bw) / w;
      const sx1 = x0 + ((x + 1) * bw) / w;
      let sum = 0, area = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          sum += ink[sy * srcSize + sx] * wx * wy;
          area += wx * wy;
        }
      }
      small[y * w + x] = area > 0 ? sum / area : 0;
    }
  }

  // 3. Centre of mass of the scaled digit.
  let mass = 0, cx = 0, cy = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = small[y * w + x];
      mass += v;
      cx += v * (x + 0.5);
      cy += v * (y + 0.5);
    }
  }
  cx /= mass;
  cy /= mass;

  // 4. Paste so the centre of mass lands on (14, 14), clamped to stay in frame.
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  const ox = clamp(Math.round(OUT / 2 - cx), OUT - w);
  const oy = clamp(Math.round(OUT / 2 - cy), OUT - h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[(oy + y) * OUT + ox + x] = Math.min(1, small[y * w + x]);
    }
  }
  return out;
}
