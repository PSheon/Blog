/** A drawing is a list of polylines in unit coordinates (0..1, y down). */
export type Point = [x: number, y: number];
export type Stroke = Point[];

/** Stroke radius as a fraction of the canvas side — a felt-tip, roughly MNIST weight. */
export const PEN_RADIUS = 0.04;

/** Resolution the network's copy of the drawing is rasterised at (4× the 28 px input). */
export const RASTER_SIZE = 112;

/**
 * Rasterise strokes into an ink map without touching a <canvas>, so the exact pixels
 * the network sees are the same in the browser, in Node and in tests.
 * Each pixel takes the max coverage of any nearby segment, with a 1 px soft edge.
 */
export function rasterize(strokes: Stroke[], size = RASTER_SIZE, radius = PEN_RADIUS): Float32Array {
  const ink = new Float32Array(size * size);
  const r = radius * size;
  const reach = r + 1;

  const stamp = (ax: number, ay: number, bx: number, by: number) => {
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach));
    const x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx) + reach));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - reach));
    const y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by) + reach));
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5 - ax;
        const py = y + 0.5 - ay;
        const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, (px * dx + py * dy) / len2));
        const d = Math.hypot(px - t * dx, py - t * dy);
        const v = Math.min(1, Math.max(0, r - d + 0.5));
        const i = y * size + x;
        if (v > ink[i]) ink[i] = v;
      }
    }
  };

  for (const stroke of strokes) {
    if (stroke.length === 1) {
      stamp(stroke[0][0] * size, stroke[0][1] * size, stroke[0][0] * size, stroke[0][1] * size);
    }
    for (let i = 1; i < stroke.length; i++) {
      stamp(stroke[i - 1][0] * size, stroke[i - 1][1] * size, stroke[i][0] * size, stroke[i][1] * size);
    }
  }
  return ink;
}

function ellipse(cx: number, cy: number, rx: number, ry: number, from = 0, to = Math.PI * 2, n = 28): Stroke {
  return Array.from({ length: n + 1 }, (_, i): Point => {
    const a = from + ((to - from) * i) / n;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
}

/** Hand-placed example digits: starting content for the instruments and keyboard-reachable input. */
export const SAMPLES: Record<number, Stroke[]> = {
  0: [ellipse(0.5, 0.5, 0.19, 0.3)],
  1: [[[0.4, 0.32], [0.53, 0.2], [0.53, 0.8]]],
  2: [[[0.3, 0.36], [0.36, 0.24], [0.5, 0.2], [0.65, 0.26], [0.68, 0.4], [0.55, 0.57], [0.3, 0.8], [0.72, 0.8]]],
  3: [[[0.3, 0.25], [0.5, 0.2], [0.66, 0.28], [0.64, 0.42], [0.48, 0.49], [0.66, 0.56], [0.68, 0.7], [0.5, 0.8], [0.3, 0.75]]],
  4: [[[0.62, 0.8], [0.62, 0.2], [0.27, 0.6], [0.76, 0.6]]],
  5: [[[0.68, 0.2], [0.36, 0.2], [0.33, 0.47], [0.5, 0.43], [0.66, 0.52], [0.67, 0.68], [0.5, 0.8], [0.3, 0.74]]],
  6: [[[0.62, 0.2], [0.42, 0.38], [0.33, 0.6], [0.4, 0.77], [0.55, 0.8], [0.66, 0.68], [0.6, 0.54], [0.45, 0.52], [0.34, 0.62]]],
  7: [[[0.28, 0.22], [0.72, 0.22], [0.45, 0.8]]],
  8: [ellipse(0.5, 0.35, 0.14, 0.15), ellipse(0.5, 0.65, 0.17, 0.16)],
  9: [ellipse(0.5, 0.37, 0.16, 0.17), [[0.66, 0.37], [0.64, 0.6], [0.5, 0.8]]],
};
