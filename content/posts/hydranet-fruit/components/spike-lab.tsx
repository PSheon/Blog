"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { mulberry32 } from "@/lib/ml";
import { type SceneSource, createSceneSource } from "./emoji";
import { HydraNet } from "./model";
import { MASK, SIZE, type Scene } from "./scene";

/** Throwaway first version of the instrument: just enough to measure emoji learnability in a real browser. */
export function SpikeLab() {
  const view = useRef<HTMLCanvasElement>(null);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState({ kind: "", seen: 0, box: 0, mask: 0, perSec: 0 });
  const state = useRef<{ source: SceneSource; net: HydraNet; test: Scene[]; rng: () => number; trainMs: number } | null>(null);

  useEffect(() => {
    if (!state.current) {
      const source = createSceneSource(), testRng = mulberry32(4242);
      state.current = { source, net: new HydraNet(), rng: mulberry32(1), trainMs: 0, test: Array.from({ length: 100 }, () => source.next(testRng)) };
    }
    const s = state.current;
    let frame = 0, ticks = 0;

    const paint = () => {
      const canvas = view.current, ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const scene = s.test[Math.floor(s.net.seen / 800) % s.test.length], p = s.net.predict(scene.image);
      const img = ctx.createImageData(SIZE, SIZE), n = SIZE * SIZE;
      for (let i = 0; i < n; i++) {
        const on = p.mask[Math.floor(Math.floor(i / SIZE) / 2) * MASK + Math.floor((i % SIZE) / 2)] > 0;
        for (let c = 0; c < 3; c++) img.data[i * 4 + c] = scene.image[c * n + i] * 255 * (on ? 1 : 0.35);
        img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      ctx.strokeStyle = "#79dafa";
      ctx.lineWidth = 1;
      ctx.strokeRect(p.box[0] * SIZE, p.box[2] * SIZE, (p.box[1] - p.box[0]) * SIZE, (p.box[3] - p.box[2]) * SIZE);
      const e = s.net.evaluate(s.test);
      setStats({ kind: s.source.kind, seen: s.net.seen, box: e.box, mask: e.mask, perSec: s.trainMs ? (s.net.seen / s.trainMs) * 1000 : 0 });
    };

    const loop = () => {
      frame = requestAnimationFrame(loop);
      const deadline = performance.now() + 12, t0 = performance.now();
      do s.net.step(Array.from({ length: 8 }, () => s.source.next(s.rng)));
      while (performance.now() < deadline);
      s.trainMs += performance.now() - t0;
      if (++ticks % 30 === 0) paint();
    };
    paint();
    if (running) frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  return (
    <div className="grid gap-4 sm:grid-cols-[16rem_1fr]">
      <canvas ref={view} width={SIZE} height={SIZE} className="aspect-square w-full border border-border [image-rendering:pixelated]" />
      <div className="grid content-start gap-3 font-mono text-sm">
        <Button size="sm" onClick={() => setRunning(!running)} data-testid="hy-train">{running ? "Pause" : "Train"}</Button>
        <pre data-testid="hy-stats">{JSON.stringify(stats)}</pre>
      </div>
    </div>
  );
}
