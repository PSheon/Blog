"use client";

import { useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { useLabels } from "./labels";
import { Stage, Transport } from "@/components/rt/stage";
import { useTracer } from "@/components/rt/use-tracer";

/**
 * Figure 3: the same picture four times, with light allowed 0, 1, 2 and any number of bounces. One renderer, one
 * canvas: the kernel draws the 2 × 2 grid itself, so the four tiles get exactly the same samples and differ in nothing
 * but the limit. Stops at 512 samples; the comparison is between limits, not between sample counts.
 */
export function BouncesLab() {
  const t = useLabels(), root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), [spp, setSpp] = useState(0);
  const tracer = useTracer(root, canvas, { triangles: 1_000, size: 512, maxSamples: 512, doublingMs: 450, configure: (r) => { r.quad = true; r.bounces = 16; }, afterFrame: (r) => setSpp(r.samples) });
  const tiles = [t.tile0, t.tile1, t.tile2, t.tileAll];
  return (
    <div ref={root} className="grid gap-4 text-sm">
      <div className="mx-auto w-full max-w-[34rem]">
        <Stage canvas={canvas} status={tracer.status} label={t.bouncesPicture} t={t} testid="light-bounces-canvas">
          {/* Names for the four tiles, laid over the canvas in the same 2 × 2. */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-2 grid-rows-2">
            {tiles.map((name) => <span key={name} className="m-2 self-start justify-self-start rounded-sm bg-black/65 px-1.5 py-0.5 font-mono text-xs text-white">{name}</span>)}
          </div>
        </Stage>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
        <Transport status={tracer.status} live={tracer.live} onToggle={tracer.toggle} onRestart={() => { setSpp(0); tracer.restart(); }} t={t} />
        <Readout label={t.spp} value={tracer.live ? spp.toLocaleString() : "–"} unit="/ 512" tone="plain" />
      </div>
    </div>
  );
}
