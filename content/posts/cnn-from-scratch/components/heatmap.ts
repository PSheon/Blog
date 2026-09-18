export type Rgb = [number, number, number];

function parse(color: string): Rgb {
  const hex = color.trim().replace("#", "");
  const n = parseInt(hex.length === 3 ? hex.replace(/./g, "$&$&") : hex.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Resolve palette tokens from CSS so canvases follow the light/dark theme. */
export function palette(el: Element) {
  const css = getComputedStyle(el);
  const read = (name: string) => parse(css.getPropertyValue(name));
  return { bg: read("--panel"), signal: read("--signal"), amber: read("--signal-2"), fg: read("--foreground") };
}

interface Options {
  /** "seq": 0..max → bg..signal. "div": −max..max → amber..bg..signal. */
  mode?: "seq" | "div";
  /** Fixed scale; defaults to the data's own max |value|. */
  max?: number;
  positive?: Rgb;
}

/** Paint a w×h value grid onto a canvas, one canvas pixel per cell (CSS scales it up, pixelated). */
export function drawHeatmap(
  canvas: HTMLCanvasElement,
  data: ArrayLike<number>,
  w: number,
  h: number,
  { mode = "seq", max, positive }: Options = {},
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = w;
  canvas.height = h;
  const p = palette(canvas);
  const pos = positive ?? p.signal;
  let scale = max ?? 0;
  if (max === undefined) for (let i = 0; i < w * h; i++) scale = Math.max(scale, Math.abs(data[i]));
  if (scale === 0) scale = 1;

  const image = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = Math.max(-1, Math.min(1, data[i] / scale));
    const to = v >= 0 || mode === "seq" ? pos : p.amber;
    const t = mode === "seq" ? Math.max(0, v) : Math.abs(v);
    image.data[i * 4] = p.bg[0] + (to[0] - p.bg[0]) * t;
    image.data[i * 4 + 1] = p.bg[1] + (to[1] - p.bg[1]) * t;
    image.data[i * 4 + 2] = p.bg[2] + (to[2] - p.bg[2]) * t;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}
