"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { useReducedMotion } from "@/components/lab/use-reduced-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLabels } from "./labels";
import type { BuildRequest, BuildResult } from "./scene.worker";

const SIZE = 512, SIZES = [1_000, 10_000, 100_000, 1_000_000] as const, BOUNCES = [0, 1, 2, 16] as const;
/** GPU time a frame may spend on samples: the rest of the 16 ms belongs to the page. */
const BUDGET_MS = 10;
/** At the start the sample count may only double this often: slow enough to watch the snow clear. */
const DOUBLING_MS = 450;

type Status = "loading" | "building" | "running" | "paused" | "no-webgpu" | "no-adapter";
interface Seen { spp: number; mrays: number; error: number | null; steps: number; triangles: number; buildMs: number; gpu: string }

/** A log-log plot of the error against the sample count, with the −½ slope it should follow drawn through its first point. */
function ErrorChart({ points, label, x, y, slope }: { points: [number, number][]; label: string; x: string; y: string; slope: string }) {
  const W = 320, H = 200, pad = { l: 34, r: 10, t: 10, b: 26 }, xMax = Math.max(64, ...points.map((p) => p[0])), lx = (v: number) => pad.l + (Math.log2(Math.max(1, v)) / Math.log2(xMax)) * (W - pad.l - pad.r);
  const errors = points.map((p) => p[1]).filter((e) => e > 0), top = Math.max(1, ...errors) * 1.2, bottom = Math.min(top / 64, ...errors) * 0.8, ly = (v: number) => pad.t + (Math.log(top / Math.max(v, bottom)) / Math.log(top / bottom)) * (H - pad.t - pad.b);
  const first = points.find((p) => p[0] >= 2 && p[1] > 0), guide = first ? [first[0], xMax].map((n) => `${lx(n).toFixed(1)},${ly(first[1] * Math.sqrt(first[0] / n)).toFixed(1)}`).join(" ") : "";
  const ticks = [1, 4, 16, 64, 256, 1024, 4096, 16384].filter((n) => n <= xMax);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block h-auto w-full">
      {ticks.map((n) => (
        <g key={n}>
          <line x1={lx(n)} x2={lx(n)} y1={pad.t} y2={H - pad.b} className="stroke-border" strokeWidth={0.5} />
          <text x={lx(n)} y={H - 10} textAnchor="middle" className="fill-muted-foreground font-mono text-[9px]">{n}</text>
        </g>
      ))}
      <text x={W - pad.r} y={H - 1} textAnchor="end" className="fill-muted-foreground font-mono text-[9px]">{x} →</text>
      <text x={4} y={pad.t + 8} className="fill-muted-foreground font-mono text-[9px]">↑ {y}</text>
      {guide && <polyline points={guide} fill="none" className="stroke-muted-foreground" strokeWidth={1} strokeDasharray="3 3" />}
      {guide && first && <text x={lx(xMax) - 4} y={ly(first[1] * Math.sqrt(first[0] / xMax)) - 5} textAnchor="end" className="fill-muted-foreground font-mono text-[9px]">{slope}</text>}
      <polyline points={points.filter((p) => p[1] > 0).map((p) => `${lx(p[0]).toFixed(1)},${ly(p[1]).toFixed(1)}`).join(" ")} fill="none" className="stroke-signal" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Figure 1: a picture that starts as snow and clears. The scene and its BVH are built in a worker, the path tracer of
 * lib/rt runs on the reader's GPU, and everything shown as a number is measured in this tab while it runs: samples per
 * pixel, rays per second, nodes visited per ray, and the picture's own error (see `Renderer.error`).
 */
export function ConvergeLab() {
  const t = useLabels(), still = useReducedMotion();
  const root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>("building"), [seen, setSeen] = useState<Seen | null>(null), [points, setPoints] = useState<[number, number][]>([]);
  const [triangles, setTriangles] = useState<number>(SIZES[0]), [bounces, setBounces] = useState<number>(16), [epoch, setEpoch] = useState(0);
  const wantRunning = useRef(true), bouncesRef = useRef(bounces), restart = useRef<(() => void) | null>(null);

  useEffect(() => { wantRunning.current = !still; }, [still]);

  useEffect(() => {
    let alive = true, visible = false, renderer: import("@/lib/rt/gpu").Renderer | null = null;
    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting), { rootMargin: "200px" });
    if (root.current) io.observe(root.current);
    const worker = new Worker(new URL("./scene.worker.ts", import.meta.url), { type: "module" });
    const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

    const run = async (built: BuildResult) => {
      if (!canvas.current) return;
      const { Renderer } = await import("@/lib/rt/gpu");
      const scene = { positions: [], material: [], materials: built.materials, camera: built.camera }, bvh = { nodes: built.nodes, nodeCount: built.nodeCount, triangles: built.packed, triangleCount: built.triangles, order: new Uint32Array(0), depth: built.depth };
      const made = await Renderer.create(canvas.current, scene, bvh, SIZE, SIZE);
      if (!alive) { if (typeof made !== "string") made.destroy(); return; }
      if (typeof made === "string") { setStatus(made); return; }
      renderer = made;
      renderer.bounces = bouncesRef.current;
      let batch = 1, last = { rays: 0, steps: 0, at: performance.now() }, speed = { mrays: 0, steps: 0 }, error: number | null = null, nextMeasure = 2, began = performance.now(), history: [number, number][] = [];
      restart.current = () => { renderer?.reset(); history = []; setPoints([]); setSeen(null); last = { rays: 0, steps: 0, at: performance.now() }; error = null; nextMeasure = 2; began = performance.now(); if (renderer) renderer.bounces = bouncesRef.current; };
      setStatus(wantRunning.current ? "running" : "paused");
      renderer.sample(1); renderer.present(); // one sample at once, so even a paused figure shows its snow

      while (alive) {
        await frame();
        if (!alive) break;
        const running = wantRunning.current && visible && !document.hidden;
        setStatus((s) => (s === "running" || s === "paused" ? (wantRunning.current ? "running" : "paused") : s));
        if (!running) { last.at = performance.now(); began += 16; continue; }
        // A GPU that does hundreds of samples a second would be past the snow before anyone saw it. So the count is
        // allowed to double every 450 ms at first (1, 2, 4, 8 …) and runs flat out once that is faster than the hardware.
        const allowed = Math.ceil(2 ** ((performance.now() - began) / DOUBLING_MS)) - renderer.samples;
        if (allowed <= 0) continue;
        const t0 = performance.now(), count = Math.min(batch, allowed);
        renderer.sample(count); renderer.present();
        await renderer.idle();
        if (count === batch) batch = Math.max(1, Math.min(64, Math.round((batch * BUDGET_MS) / Math.max(performance.now() - t0, 0.5))));
        // Throughput on its own clock: the counters are u32, and at these speeds the node counter wraps every couple of
        // seconds. Read four times a second, a difference modulo 2³² is always the true one.
        const at = performance.now();
        if (at - last.at > 250) {
          const counters = await renderer.readCounters();
          if (!alive) break;
          const rays = (counters.rays - last.rays) >>> 0, steps = (counters.steps - last.steps) >>> 0, seconds = (performance.now() - last.at) / 1000;
          last = { rays: counters.rays, steps: counters.steps, at: performance.now() };
          if (rays) speed = { mrays: rays / seconds / 1e6, steps: steps / rays };
        }
        // The error, at every power of √2 samples, so the points are evenly spaced on the chart's logarithmic axis.
        if (renderer.samples >= nextMeasure) {
          nextMeasure = Math.max(nextMeasure + 1, Math.ceil(renderer.samples * Math.SQRT2));
          error = await renderer.error();
          if (!alive) break;
          history = [...history, [renderer.samples, error] as [number, number]];
          setPoints(history);
        }
        setSeen({ spp: renderer.samples, ...speed, error, triangles: built.triangles, buildMs: built.buildMs, gpu: renderer.adapterName });
      }
    };

    worker.onmessage = (event: MessageEvent<BuildResult>) => void run(event.data);
    worker.postMessage({ triangles } satisfies BuildRequest);
    return () => { alive = false; io.disconnect(); worker.terminate(); renderer?.destroy(); restart.current = null; };
  }, [triangles, epoch]);

  /** A new scene: the figure goes back to "building" here, where it is asked for, and the effect above does the work. */
  const rebuild = (next: number) => { setStatus("building"); setPoints([]); setSeen(null); setTriangles(next); setEpoch((e) => e + 1); };
  const live = status === "running" || status === "paused", unavailable = status === "no-webgpu" || status === "no-adapter";
  const compact = (n: number) => (n >= 1e6 ? `${n / 1e6}M` : `${n / 1e3}k`);

  return (
    <div ref={root} className="grid gap-5 text-sm">
      <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <div className="relative">
          <canvas ref={canvas} role="img" aria-label={t.picture} className="block aspect-square w-full rounded-md border border-border bg-black" data-testid="light-canvas" />
          {!live && (
            <p className="absolute inset-0 grid place-items-center rounded-md bg-background/80 p-6 text-center text-muted-foreground" data-testid="light-status">
              {status === "no-webgpu" ? t.noWebgpu : status === "no-adapter" ? t.noAdapter : status === "building" ? t.building : t.loading}
            </p>
          )}
        </div>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Readout label={t.spp} value={<span data-testid="light-spp">{seen ? seen.spp.toLocaleString() : "–"}</span>} large />
            <Readout label={t.noise} value={seen?.error != null ? (seen.error * 100).toFixed(seen.error < 0.1 ? 1 : 0) : "–"} unit="%" tone="alt" large />
            <Readout label={t.rays} value={seen ? seen.mrays.toFixed(0) : "–"} unit={t.million} tone="plain" />
            <Readout label={t.steps} value={seen ? seen.steps.toFixed(1) : "–"} tone="plain" />
            <Readout label={t.triangles} value={seen ? seen.triangles.toLocaleString() : "–"} tone="plain" />
            <Readout label={t.build} value={seen ? seen.buildMs.toFixed(0) : "–"} unit={t.ms} tone="plain" />
          </div>
          <ErrorChart points={points} label={t.chart} x={t.chartX} y={t.chartY} slope={t.slope} />
          {seen && <p className="label normal-case">{t.gpu}: {seen.gpu}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-4">
        <div className="flex gap-2">
          <Button size="sm" disabled={!live} onClick={() => { wantRunning.current = !wantRunning.current; setStatus(wantRunning.current ? "running" : "paused"); }} data-testid="light-toggle">
            {status === "running" ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
            {status === "running" ? t.pause : t.start}
          </Button>
          <Button size="sm" variant="ghost" disabled={!live} onClick={() => restart.current?.()}><RotateCcw className="size-4" aria-hidden />{t.restart}</Button>
        </div>
        <div className="flex items-center gap-2" role="group" aria-label={t.triangles}>
          <span className="label">{t.triangles}</span>
          {SIZES.map((n) => <Button key={n} size="sm" variant={triangles === n ? "default" : "outline"} disabled={unavailable} onClick={() => rebuild(n)} data-testid={`light-tris-${n}`}>{compact(n)}</Button>)}
        </div>
        <div className="flex items-center gap-2" role="group" aria-label={t.bounces}>
          <span className="label">{t.bounces}</span>
          {BOUNCES.map((n) => (
            <Button key={n} size="sm" variant={bounces === n ? "default" : "outline"} disabled={!live} className={cn(n === 16 && "px-3")} onClick={() => { setBounces(n); bouncesRef.current = n; restart.current?.(); }}>
              {n === 16 ? t.unlimited : n}
            </Button>
          ))}
        </div>
      </div>
      <p className="text-muted-foreground">{t.measured}</p>
      {/* Rebuilding is a change of key for the effect above; a failed GPU start can be tried again the same way. */}
      {unavailable && <Button size="sm" variant="outline" className="justify-self-start" onClick={() => rebuild(triangles)}>{t.restart}</Button>}
    </div>
  );
}
