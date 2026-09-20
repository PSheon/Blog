"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/components/lab/use-reduced-motion";
import { apple } from "@/content/posts/diffusion-points/components/shapes";

const N = 900;
/** Seconds: noise → apple, then hold the apple, then start again from fresh noise. */
const DENOISE = 4.2, HOLD = 2.6;

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The article's own apple (the same sampler the model is trained on), pushed through the article's
 * forward process x_t = √ᾱ·x₀ + √(1−ᾱ)·ε with a cosine schedule, and played backwards. No model runs
 * here: it is the picture of what the trained one does, light enough for the home page (2-D canvas,
 * no three.js). Colours are diffused along with the positions, as in the article.
 */
export default function DiffusionPreview({ className = "block aspect-[8/5] w-full" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const still = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rng = mulberry(20260920);
    const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
    const clean = new Float32Array(N * 6), noise = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) clean.set(apple(rng), i * 6);
    const renoise = () => { for (let i = 0; i < N * 6; i++) noise[i] = gauss(); };
    renoise();

    let w = 0, h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    // Resizing a canvas wipes it, and off screen no frame is coming to repaint it: draw the last state again.
    let shown: [number, number] = still ? [1, 0.6] : [0, 0];
    const ro = new ResizeObserver(() => { resize(); draw(...shown); });
    ro.observe(canvas);

    const order = new Uint16Array(N).map((_, i) => i);
    const depth = new Float32Array(N);
    const to255 = (v: number) => Math.max(0, Math.min(255, Math.round((v * 0.5 + 0.5) * 255)));

    /** `k` is how far the denoising has come: 0 pure noise, 1 the clean apple. */
    function draw(k: number, angle: number) {
      shown = [k, angle];
      const ab = Math.cos(((1 - k) * Math.PI) / 2) ** 2, sa = Math.sqrt(ab), sn = Math.sqrt(1 - ab);
      const c = Math.cos(angle), s = Math.sin(angle), scale = Math.min(w, h) * 0.56;
      ctx!.clearRect(0, 0, w, h);
      const px = new Float32Array(N * 2);
      for (let i = 0; i < N; i++) {
        const o = i * 6;
        const x = sa * clean[o] + sn * noise[o] * 0.9, y = sa * clean[o + 1] + sn * noise[o + 1] * 0.9, z = sa * clean[o + 2] + sn * noise[o + 2] * 0.9;
        px[i * 2] = w / 2 + (x * c - y * s) * scale;
        px[i * 2 + 1] = h * 0.52 - z * scale;
        depth[i] = x * s + y * c;
      }
      order.sort((a, b) => depth[b] - depth[a]);
      for (const i of order) {
        const o = i * 6, near = Math.max(0, Math.min(1, 0.5 - depth[i] * 0.45));
        const r = to255(sa * clean[o + 3] + sn * noise[o + 3]), g = to255(sa * clean[o + 4] + sn * noise[o + 4]), b = to255(sa * clean[o + 5] + sn * noise[o + 5]);
        ctx!.fillStyle = `rgba(${r},${g},${b},${0.35 + near * 0.65})`;
        const size = 1.1 + near * 1.5;
        ctx!.fillRect(px[i * 2] - size / 2, px[i * 2 + 1] - size / 2, size, size);
      }
    }

    if (still) {
      draw(1, 0.6);
      return () => ro.disconnect();
    }

    let raf = 0, visible = false, clock = 0, last = 0, cycle = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      clock += Math.min(0.05, (now - last) / 1000);
      last = now;
      const period = DENOISE + HOLD, n = Math.floor(clock / period), t = clock - n * period;
      if (n !== cycle) { cycle = n; renoise(); }
      const lin = Math.min(1, t / DENOISE);
      // Ease out: like sampling, most of the visible change happens early, the detail arrives late.
      draw(1 - (1 - lin) ** 2.2, clock * 0.45);
    };
    // Only spend frames while the card is on screen and the tab is in front.
    const run = () => {
      const want = visible && !document.hidden;
      if (want && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
      else if (!want && raf) { cancelAnimationFrame(raf); raf = 0; }
    };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; run(); });
    io.observe(canvas);
    document.addEventListener("visibilitychange", run);
    draw(0, 0);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", run);
    };
  }, [still]);

  return <canvas ref={ref} className={className} aria-hidden />;
}
