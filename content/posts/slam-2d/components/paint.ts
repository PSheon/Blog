import { type Pose, compose, transformPoints } from "./se2";
import type { Segment } from "./world";

/** For things in the page (legend swatches, the glow): the site's own signal colours, which follow the theme by themselves. */
export const CYAN = "var(--signal)", VIOLET = "var(--signal-3)", PINK = "var(--signal-2)";

/** World metres → canvas pixels for a canvas that shows the 20 × 14 m ring with a margin. */
export interface View { w: number; h: number; scale: number; ox: number; oy: number }
export const ringView = (w: number, h: number): View => {
  const scale = Math.min((w - 24) / 20, (h - 24) / 14);
  return { w, h, scale, ox: (w - 20 * scale) / 2, oy: (h + 14 * scale) / 2 };
};
export const X = (v: View, x: number) => v.ox + x * v.scale, Y = (v: View, y: number) => v.oy - y * v.scale;

/** Size the backing store to the element and the screen's pixel ratio; returns a context in CSS pixels. */
export function prepare(canvas: HTMLCanvasElement | null): { ctx: CanvasRenderingContext2D; w: number; h: number; ink: string; muted: string } | null {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return null;
  const ratio = Math.min(2, window.devicePixelRatio || 1), w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) { canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio); }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const css = getComputedStyle(canvas);
  return { ctx, w, h, ink: css.color, muted: css.getPropertyValue("--muted-foreground") || css.color };
}

export function walls(ctx: CanvasRenderingContext2D, v: View, world: Segment[], color: string, alpha = 1) {
  ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = 2; ctx.beginPath();
  for (const [x0, y0, x1, y1] of world) { ctx.moveTo(X(v, x0), Y(v, y0)); ctx.lineTo(X(v, x1), Y(v, y1)); }
  ctx.stroke(); ctx.globalAlpha = 1;
}

export function path(ctx: CanvasRenderingContext2D, v: View, poses: Pose[], color: string, width: number, origin?: Pose) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = "round"; ctx.beginPath();
  poses.forEach((p, i) => { const q = origin ? compose(origin, p) : p; if (i) ctx.lineTo(X(v, q.x), Y(v, q.y)); else ctx.moveTo(X(v, q.x), Y(v, q.y)); });
  ctx.stroke();
}

export function dots(ctx: CanvasRenderingContext2D, v: View, pose: Pose, points: Float64Array, color: string, alpha: number, size = 1.5) {
  const pts = transformPoints(pose, points);
  ctx.fillStyle = color; ctx.globalAlpha = alpha;
  for (let i = 0; i < pts.length; i += 2) ctx.fillRect(X(v, pts[i]) - size / 2, Y(v, pts[i + 1]) - size / 2, size, size);
  ctx.globalAlpha = 1;
}

export function car(ctx: CanvasRenderingContext2D, v: View, p: Pose, color: string) {
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(X(v, p.x), Y(v, p.y), 5.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(X(v, p.x), Y(v, p.y)); ctx.lineTo(X(v, p.x + Math.cos(p.theta) * 0.75), Y(v, p.y + Math.sin(p.theta) * 0.75)); ctx.stroke();
}
