import type { Vec2 } from "./types";

/** Counting-sort spatial hash over a square world; rebuilt every movement sub-step without allocating. */
export class SpatialHash {
  private readonly cols: number;
  private readonly start: Int32Array;
  private items = new Int32Array(0);
  private cellOf = new Int32Array(0);

  constructor(size: number, private readonly cell: number) {
    this.cols = Math.max(1, Math.ceil(size / cell));
    this.start = new Int32Array(this.cols * this.cols + 1);
  }

  private index(x: number, y: number): number {
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cell))), r = Math.min(this.cols - 1, Math.max(0, Math.floor(y / this.cell)));
    return r * this.cols + c;
  }

  /** `ids` are the members; `xs`/`ys` are indexed by id. */
  build(ids: ArrayLike<number>, count: number, xs: ArrayLike<number>, ys: ArrayLike<number>): void {
    if (this.items.length < count) { this.items = new Int32Array(count * 2); this.cellOf = new Int32Array(count * 2); }
    this.start.fill(0);
    for (let k = 0; k < count; k++) { const c = this.index(xs[ids[k]], ys[ids[k]]); this.cellOf[k] = c; this.start[c + 1]++; }
    for (let c = 0; c < this.start.length - 1; c++) this.start[c + 1] += this.start[c];
    const cursor = this.start.slice(0, -1);
    for (let k = 0; k < count; k++) this.items[cursor[this.cellOf[k]]++] = ids[k];
  }

  /** Calls `visit` for every member in the 3 × 3 cells around (x, y). */
  near(x: number, y: number, visit: (id: number) => void): void {
    const c0 = Math.floor(x / this.cell), r0 = Math.floor(y / this.cell);
    for (let r = Math.max(0, r0 - 1); r <= Math.min(this.cols - 1, r0 + 1); r++) for (let c = Math.max(0, c0 - 1); c <= Math.min(this.cols - 1, c0 + 1); c++) {
      for (let k = this.start[r * this.cols + c]; k < this.start[r * this.cols + c + 1]; k++) visit(this.items[k]);
    }
  }
}

/** Unit vector towards the target, scaled down inside `slowRadius` when `arrive` is set. */
export function seek(pos: Vec2, target: Vec2, arrive: boolean, slowRadius: number, out: Vec2): Vec2 {
  const dx = target[0] - pos[0], dy = target[1] - pos[1], d = Math.hypot(dx, dy);
  if (d < 1e-9) { out[0] = 0; out[1] = 0; return out; }
  const scale = arrive && d < slowRadius ? Math.max(0.25, d / slowRadius) : 1;
  out[0] = (dx / d) * scale; out[1] = (dy / d) * scale;
  return out;
}

/** Push away from a neighbour at (nx, ny): stronger the closer it is, zero at `radius`. Accumulates into `out`. */
export function separate(pos: Vec2, nx: number, ny: number, radius: number, out: Vec2): void {
  const dx = pos[0] - nx, dy = pos[1] - ny, d = Math.hypot(dx, dy);
  if (d >= radius || d < 1e-9) return;
  const push = (radius - d) / radius / d;
  out[0] += dx * push; out[1] += dy * push;
}

/** Keep `pos` within `halfWidth` of the segment a → b (the pavement under a route leg). Returns progress along it, 0–1. */
export function clampToCorridor(pos: Vec2, a: Vec2, b: Vec2, halfWidth: number): number {
  const ex = b[0] - a[0], ey = b[1] - a[1], len2 = ex * ex + ey * ey;
  if (len2 < 1e-12) return 1;
  const s = ((pos[0] - a[0]) * ex + (pos[1] - a[1]) * ey) / len2, t = Math.min(1, Math.max(0, s));
  const px = a[0] + ex * t, py = a[1] + ey * t, ox = pos[0] - px, oy = pos[1] - py, off = Math.hypot(ox, oy);
  if (off > halfWidth) { pos[0] = px + (ox / off) * halfWidth; pos[1] = py + (oy / off) * halfWidth; }
  return s;
}
