"use client";

import { RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Button } from "@/components/ui/button";
import { useLabels } from "./labels";
import { Stage } from "./stage";
import { useTracer } from "./use-tracer";

const SIZES = [1_000, 10_000, 100_000, 1_000_000] as const;
/** Without a hierarchy every ray tests every triangle. Past this many, one sample is long enough for a browser to kill the GPU task. */
const BRUTE_LIMIT = 10_000;
/** Samples in one measured burst. The heat map is settled long before; the burst is for the two numbers. */
const BURST = 64;

/**
 * Figure 4: what the hierarchy saves. The picture is not shaded: each pixel shows how many BVH nodes its camera ray had
 * to visit (or, with the hierarchy off, how many triangles it tested, which is all of them). The numbers beside it are
 * measured in this tab: visits per ray and rays per second.
 */
export function BvhLab() {
  const t = useLabels(), root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [triangles, setTriangles] = useState<number>(SIZES[0]), [brute, setBrute] = useState(false), [seen, setSeen] = useState<{ perRay: number; mrays: number; build: number; count: number; depth: number } | null>(null), [progress, setProgress] = useState(0);
  // `wanted` is what the switch says right now; `configure` may run before React has rendered the new state.
  const burst = useRef({ gpuMs: 0, done: false }), wanted = useRef(false);
  const off = brute && triangles <= BRUTE_LIMIT;
  const tracer = useTracer(root, canvas, {
    triangles, size: 256, maxSamples: BURST, autostart: true, budgetMs: off ? 30 : 10,
    // White is 48 node visits with the hierarchy; without it the scale is the triangle count, or everything would be white.
    configure: (r) => { const bruteNow = wanted.current && triangles <= BRUTE_LIMIT; r.heat = true; r.brute = bruteNow; r.heatMax = bruteNow ? triangles : 48; },
    // A fixed burst, measured exactly: every ray and every visit of the 64 samples, over the GPU time they took.
    afterFrame: async (r, built, batch) => {
      const k = burst.current;
      if (k.done) return;
      k.gpuMs += batch.gpuMs;
      setProgress(r.samples);
      if (r.samples < BURST) return;
      k.done = true;
      const c = await r.readCounters();
      // Without the hierarchy a ray tests every triangle, by construction; the u32 counter cannot hold 64 × 65 536 × 9 612.
      setSeen({ perRay: r.brute ? built.triangles : c.steps / c.rays, mrays: c.rays / (k.gpuMs / 1000) / 1e6, build: built.buildMs, count: built.triangles, depth: built.depth });
    },
  });
  const again = () => { burst.current = { gpuMs: 0, done: false }; setSeen(null); setProgress(0); };
  const compact = (n: number) => (n >= 1e6 ? `${n / 1e6}M` : `${n / 1e3}k`);

  return (
    <div ref={root} className="grid gap-5 text-sm">
      <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <div>
          <Stage canvas={canvas} status={tracer.status} label={t.heatPicture} t={t} testid="light-heat-canvas" />
          <p className="mt-2 flex items-center gap-2 font-mono text-xs text-muted-foreground">
            0 <span className="h-2 flex-1 rounded-full" style={{ background: "linear-gradient(90deg, #08051a, #7333d9 35%, #ff6e96 65%, #fff2b3)" }} aria-hidden /> {off ? triangles.toLocaleString() : 48}
            <span className="ml-1">{off ? t.heatUnitBrute : t.heatUnit}</span>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Readout label={off ? t.testsPerRay : t.steps} value={seen ? seen.perRay.toFixed(seen.perRay > 100 ? 0 : 1) : "–"} large tone={off ? "alt" : "signal"} />
          <Readout label={t.rays} value={seen ? seen.mrays.toFixed(seen.mrays < 10 ? 1 : 0) : "–"} unit={t.million} large tone="plain" />
          <Readout label={t.triangles} value={seen ? seen.count.toLocaleString() : "–"} tone="plain" />
          <Readout label={t.depth} value={seen ? seen.depth : "–"} tone="plain" />
          <Readout label={t.build} value={seen ? seen.build.toFixed(0) : "–"} unit={t.ms} tone="plain" />
          <Readout label={t.spp} value={tracer.live ? progress : "–"} unit={`/ ${BURST}`} tone="plain" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-4">
        {/* A burst of 64 samples is a measurement, not something to pause: the one control is to take it again. */}
        <Button size="sm" disabled={!tracer.live} onClick={() => { again(); tracer.restart(); }} data-testid="light-bvh-again"><RotateCcw className="size-4" aria-hidden />{t.measureAgain}</Button>
        <div className="flex items-center gap-2" role="group" aria-label={t.triangles}>
          <span className="label">{t.triangles}</span>
          {SIZES.map((n) => <Button key={n} size="sm" variant={triangles === n ? "default" : "outline"} disabled={tracer.unavailable} onClick={() => { again(); setTriangles(n); tracer.rebuild(); }} data-testid={`light-bvh-tris-${n}`}>{compact(n)}</Button>)}
        </div>
        <Button size="sm" variant={off ? "default" : "outline"} aria-pressed={off} disabled={!tracer.live || triangles > BRUTE_LIMIT} onClick={() => { again(); wanted.current = !wanted.current; setBrute(wanted.current); tracer.restart(); }} data-testid="light-bvh-off">{t.bvhOff}</Button>
      </div>
      {triangles > BRUTE_LIMIT && <p className="text-muted-foreground">{t.bruteLimit}</p>}
    </div>
  );
}
