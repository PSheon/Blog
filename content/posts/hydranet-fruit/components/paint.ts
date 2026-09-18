import { MASK, SIZE, type Scene } from "./scene";

export interface Overlay {
  /** MASK×MASK values; cells where value > threshold are kept bright, the rest are dimmed. */
  mask?: { values: ArrayLike<number>; threshold: number };
  boxes?: { box: Scene["box"]; color: string; dashed?: boolean }[];
}

/**
 * Draw a 32×32 scene enlarged with hard pixels, then overlays at full canvas resolution so box
 * lines stay one crisp pixel wide instead of being scaled up with the image.
 */
export function paintScene(canvas: HTMLCanvasElement, image: ArrayLike<number> | null, { mask, boxes = [] }: Overlay = {}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const side = Math.max(1, Math.round(canvas.clientWidth * dpr));
  if (canvas.width !== side) canvas.width = canvas.height = side;
  const cell = side / SIZE, n = SIZE * SIZE;
  ctx.clearRect(0, 0, side, side);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const on = !mask || mask.values[Math.floor(y / 2) * MASK + Math.floor(x / 2)] > mask.threshold;
      const k = on ? 255 : 70;
      ctx.fillStyle = image
        ? `rgb(${image[i] * k},${image[n + i] * k},${image[2 * n + i] * k})`
        : on ? "rgb(233,234,246)" : "rgb(20,22,48)";
      ctx.fillRect(Math.floor(x * cell), Math.floor(y * cell), Math.ceil(cell), Math.ceil(cell));
    }
  }

  ctx.lineWidth = Math.max(1.5, dpr * 1.5);
  for (const { box, color, dashed } of boxes) {
    ctx.strokeStyle = color;
    ctx.setLineDash(dashed ? [4 * dpr, 4 * dpr] : []);
    ctx.strokeRect(box[0] * side, box[2] * side, (box[1] - box[0]) * side, (box[3] - box[2]) * side);
  }
  ctx.setLineDash([]);
}

/** Tightest box around the mask cells predicted as object — the baseline the box head has to beat. */
export function boxFromMask(logits: ArrayLike<number>): Scene["box"] | null {
  let x0 = MASK, y0 = MASK, x1 = -1, y1 = -1;
  for (let i = 0; i < MASK * MASK; i++) {
    if (logits[i] <= 0) continue;
    const x = i % MASK, y = Math.floor(i / MASK);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : [x0 / MASK, (x1 + 1) / MASK, y0 / MASK, (y1 + 1) / MASK];
}
