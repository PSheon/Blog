import type { Rng } from "@/lib/ml";
import { SIZE, type Scene, background, compose, shapeScene } from "./scene";

export const FRUITS = ["🍎", "🍌", "🍇", "🍊", "🍓", "🍉", "🍐", "🍑", "🥝", "🍋"];

const SPRITE = 96;

export interface SceneSource {
  /** "emoji" when the system draws colour emoji; "shapes" when it can't and we fall back. */
  kind: "emoji" | "shapes";
  next(rng: Rng): Scene;
}

/**
 * Draws fruit emoji with a random size, rotation and position, and labels them from their own
 * alpha channel. Every operating system ships different emoji artwork, so each reader trains on
 * their own system's fruit.
 */
export function createSceneSource(fruits: string[] = FRUITS): SceneSource {
  const sprites = fruits.map(renderSprite).filter((s): s is HTMLCanvasElement => s !== null);
  // No colour emoji font (some Linux setups draw tofu or monochrome outlines): use shapes instead.
  if (sprites.length === 0) return { kind: "shapes", next: shapeScene };

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const n = SIZE * SIZE;

  return {
    kind: "emoji",
    next(rng) {
      for (;;) {
        const sprite = sprites[Math.floor(rng() * sprites.length)];
        const side = SIZE * (0.34 + rng() * 0.46);
        const half = side / 2;
        const cx = half + rng() * (SIZE - side), cy = half + rng() * (SIZE - side);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, SIZE, SIZE);
        ctx.translate(cx, cy);
        ctx.rotate((rng() - 0.5) * 0.9);
        if (rng() < 0.5) ctx.scale(-1, 1);
        ctx.drawImage(sprite, -half, -half, side, side);

        const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
        const rgb = new Float64Array(3 * n), alpha = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          alpha[i] = data[i * 4 + 3] / 255;
          for (let c = 0; c < 3; c++) rgb[c * n + i] = data[i * 4 + c] / 255;
        }
        const scene = compose(background(rng), rgb, alpha);
        if (scene) return scene;
      }
    },
  };
}

/** Render one glyph large, once. Returns null if it didn't come out as a colour picture. */
function renderSprite(glyph: string): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SPRITE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${SPRITE * 0.78}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.fillText(glyph, SPRITE / 2, SPRITE / 2 + SPRITE * 0.04);

  const { data } = ctx.getImageData(0, 0, SPRITE, SPRITE);
  let opaque = 0, colourful = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    opaque++;
    if (Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) > 40) colourful++;
  }
  // Tofu and monochrome fallbacks are grey/black; real emoji art is mostly saturated.
  return opaque > SPRITE * SPRITE * 0.08 && colourful > opaque * 0.25 ? canvas : null;
}
