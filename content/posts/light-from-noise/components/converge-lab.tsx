"use client";

import { useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLabels } from "./labels";
import { FALLBACK, Stage, Transport } from "./stage";
import { useTracer } from "./use-tracer";

const SIZE = 512, SIZES = [1_000, 10_000, 100_000, 1_000_000] as const, BOUNCES = [0, 1, 2, 16] as const;
/** GPU time a frame may spend on samples: the rest of the 16 ms belongs to the page. */
const BUDGET_MS = 10;
/** At the start the sample count may only double this often: slow enough to watch the snow clear. */
const DOUBLING_MS = 450;

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
 * Figure 1: a picture that starts as snow and clears. The path tracer of lib/rt runs on the reader's GPU, and everything
 * shown as a number is measured in this tab while it runs: samples per pixel, rays per second, nodes visited per ray,
 * and the picture's own error (see `Renderer.error`).
 */
export function ConvergeLab() {
  const t = useLabels(), root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [seen, setSeen] = useState<Seen | null>(null), [points, setPoints] = useState<[number, number][]>([]);
  const [triangles, setTriangles] = useState<number>(SIZES[0]), [bounces, setBounces] = useState<number>(16);
  // What the frame loop carries between frames. Reset whenever the picture starts over.
  const track = useRef({ rays: 0, steps: 0, at: 0, mrays: 0, perRay: 0, error: null as number | null, next: 2, history: [] as [number, number][] });
  const fresh = () => { track.current = { rays: 0, steps: 0, at: performance.now(), mrays: 0, perRay: 0, error: null, next: 2, history: [] }; setPoints([]); setSeen(null); };

  const tracer = useTracer(root, canvas, {
    triangles, size: SIZE, doublingMs: DOUBLING_MS, budgetMs: BUDGET_MS,
    configure: (r) => { r.bounces = bounces; },
    afterFrame: async (r, built) => {
      const k = track.current;
      if (r.samples < k.next / 2) Object.assign(k, { rays: 0, steps: 0, at: performance.now(), error: null, next: 2, history: [] }); // the picture was restarted under us
      // Throughput on its own clock: the counters are u32, and at these speeds the node counter wraps every couple of
      // seconds. Read four times a second, a difference modulo 2³² is always the true one.
      if (performance.now() - k.at > 250) {
        const c = await r.readCounters(), rays = (c.rays - k.rays) >>> 0, steps = (c.steps - k.steps) >>> 0, seconds = (performance.now() - k.at) / 1000;
        Object.assign(k, { rays: c.rays, steps: c.steps, at: performance.now() });
        if (rays) Object.assign(k, { mrays: rays / seconds / 1e6, perRay: steps / rays });
      }
      // The error, at every power of √2 samples, so the points are evenly spaced on the chart's logarithmic axis.
      if (r.samples >= k.next) {
        k.next = Math.max(k.next + 1, Math.ceil(r.samples * Math.SQRT2));
        k.error = await r.error();
        k.history = [...k.history, [r.samples, k.error]];
        setPoints(k.history);
      }
      setSeen({ spp: r.samples, mrays: k.mrays, error: k.error, steps: k.perRay, triangles: built.triangles, buildMs: built.buildMs, gpu: r.adapterName });
    },
  });
  const { status, live, unavailable } = tracer;
  const compact = (n: number) => (n >= 1e6 ? `${n / 1e6}M` : `${n / 1e3}k`);

  return (
    <div ref={root} className="grid gap-5 text-sm">
      <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <Stage canvas={canvas} status={status} label={t.picture} t={t} fallback={FALLBACK} />
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
        <Transport status={status} live={live} onToggle={tracer.toggle} onRestart={() => { fresh(); tracer.restart(); }} t={t} />
        <div className="flex items-center gap-2" role="group" aria-label={t.triangles}>
          <span className="label">{t.triangles}</span>
          {SIZES.map((n) => <Button key={n} size="sm" variant={triangles === n ? "default" : "outline"} disabled={unavailable} onClick={() => { fresh(); setTriangles(n); tracer.rebuild(); }} data-testid={`light-tris-${n}`}>{compact(n)}</Button>)}
        </div>
        <div className="flex items-center gap-2" role="group" aria-label={t.bounces}>
          <span className="label">{t.bounces}</span>
          {BOUNCES.map((n) => (
            <Button key={n} size="sm" variant={bounces === n ? "default" : "outline"} disabled={!live} className={cn(n === 16 && "px-3")} onClick={() => { setBounces(n); fresh(); if (tracer.renderer.current) tracer.renderer.current.bounces = n; tracer.renderer.current?.reset(); }}>
              {n === 16 ? t.unlimited : n}
            </Button>
          ))}
        </div>
      </div>
      <p className="text-muted-foreground">{t.measured}</p>
      {unavailable && <Button size="sm" variant="outline" className="justify-self-start" onClick={tracer.rebuild}>{t.restart}</Button>}
    </div>
  );
}
