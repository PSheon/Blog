"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/components/lab/use-reduced-motion";
import { Button } from "@/components/ui/button";
import { CloudView } from "./cloud-view";
import { PointDiffusion, type Shape, T, gaussian, schedule } from "./diffusion";
import { fromPoints, knot, torus } from "./shapes";

const POINTS = 3000, SAMPLING_STEPS = 40;
type ShapeName = "lite3" | "knot" | "torus";

/** Throwaway first version: does a from-scratch diffusion model learn a 3-D shape fast enough to watch? */
export function SpikeLab() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const still = useReducedMotion();
  const [shapeName, setShapeName] = useState<ShapeName>("lite3");
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState({ steps: 0, loss: 0, perSec: 0, level: T });
  const live = useRef({ running: false, replay: 0 });

  useEffect(() => {
    let frame = 0, disposed = false, view: CloudView | null = null;
    const net = new PointDiffusion(64);
    const cloud = new Float64Array(POINTS * 3);
    let shape: Shape | null = shapeName === "knot" ? knot : shapeName === "torus" ? torus : null;
    if (!shape) {
      void fetch("/diffusion/lite3-points.i16").then((r) => r.arrayBuffer()).then((b) => {
        shape = fromPoints(Float32Array.from(new Int16Array(b), (v) => v / 32767));
      });
    }
    let levels: number[] = [], at = 0, hold = 0, trainMs = 0, prev = performance.now(), sinceStats = 0;
    const restart = () => { for (let i = 0; i < cloud.length; i++) cloud[i] = gaussian(Math.random); levels = schedule(SAMPLING_STEPS); at = 0; hold = 0; };
    restart();
    live.current.replay = 0;

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const dt = (now - prev) / 1000;
      prev = now;
      if (live.current.running && shape) {
        const t0 = performance.now();
        do net.train(shape, 256, net.steps < 4000 ? 2e-3 : 5e-4);
        while (performance.now() - t0 < 9);
        trainMs += performance.now() - t0;
      }
      // Keep sampling with whatever the network knows so far: noise → shape, pause, start over.
      if (at < SAMPLING_STEPS) { net.denoise(cloud, levels[at], levels[at + 1]); at++; }
      else if ((hold += dt) > 1.6 || live.current.replay) { live.current.replay = 0; restart(); }
      view?.set(cloud);
      view?.render(dt, !still);
      if ((sinceStats += dt) > 0.25) {
        sinceStats = 0;
        setStats({ steps: net.steps, loss: net.loss, perSec: trainMs ? (net.steps / trainMs) * 1000 : 0, level: levels[Math.min(at, SAMPLING_STEPS)] });
      }
    };
    void CloudView.create(canvas.current!, POINTS).then((v) => {
      if (disposed) return v.dispose();
      view = v;
      frame = requestAnimationFrame(loop);
    });
    return () => { disposed = true; cancelAnimationFrame(frame); view?.dispose(); };
  }, [shapeName, still]);

  useEffect(() => { live.current.running = running; }, [running]);

  return (
    <div className="grid gap-3 text-sm">
      <canvas ref={canvas} className="aspect-[4/3] w-full rounded-md border border-border bg-background sm:aspect-[2/1]" data-testid="diffusion-stage" />
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setRunning((r) => !r)} data-testid="diffusion-train">{running ? "Pause" : "Train"}</Button>
        <Button variant="outline" onClick={() => (live.current.replay = 1)}>Sample again</Button>
        <label className="flex items-center gap-2">
          shape
          <select className="rounded border border-border bg-background px-1 py-0.5" value={shapeName} onChange={(e) => { setRunning(false); setShapeName(e.target.value as ShapeName); }}>
            <option value="lite3">Lite3</option>
            <option value="knot">trefoil knot</option>
            <option value="torus">torus</option>
          </select>
        </label>
      </div>
      <p className="font-mono tabular text-muted-foreground" data-testid="diffusion-stats">
        step {stats.steps} · loss {stats.loss.toFixed(3)} · {stats.perSec.toFixed(0)} steps/s · noise level {stats.level}/{T}
      </p>
    </div>
  );
}
