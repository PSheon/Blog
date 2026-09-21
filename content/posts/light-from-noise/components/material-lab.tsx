"use client";

import { useRef, useState } from "react";
import { Stage, Transport } from "@/components/rt/stage";
import { useTracer } from "@/components/rt/use-tracer";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { BALL, type Material } from "@/lib/rt";
import { useLabels } from "./labels";

const KINDS = ["matte", "metal", "glass"] as const;
type Kind = (typeof KINDS)[number];
const COPPER: [number, number, number] = [0.95, 0.64, 0.37];

/**
 * One ball, three materials, and the two numbers that shape them. Rendered with both ways of finding the lamp (MIS),
 * or a mirror-smooth ball would show the lamp as a storm of specks.
 */
export function MaterialLab() {
  const t = useLabels(), root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [kind, setKind] = useState<Kind>("metal"), [roughness, setRoughness] = useState(0.3), [ior, setIor] = useState(1.5), [spp, setSpp] = useState(0);
  const want = useRef({ kind, roughness, ior });
  const material = (): Material => { const w = want.current; return { albedo: w.kind === "glass" ? [1, 1, 1] : COPPER, emit: [0, 0, 0], metallic: w.kind === "metal", glass: w.kind === "glass", roughness: w.roughness, ior: w.ior }; };
  const tracer = useTracer(root, canvas, {
    studio: { lamp: 0.3 }, size: 512, autostart: true, maxSamples: 1024, budgetMs: 10,
    configure: (r) => { r.strategy = 3; r.bounces = 16; r.setMaterial(BALL, material()); },
    afterFrame: (r) => setSpp(r.samples),
  });
  const change = (next: Partial<typeof want.current>) => { want.current = { ...want.current, ...next }; tracer.restart(); };

  return (
    <div ref={root} className="grid gap-4 text-sm">
      <div className="mx-auto w-full max-w-[34rem]"><Stage canvas={canvas} status={tracer.status} label={t.materialPicture} t={t} testid="light-material-canvas" /></div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-4">
        <Transport status={tracer.status} live={tracer.live} onToggle={tracer.toggle} onRestart={tracer.restart} t={t} />
        <div className="flex items-center gap-2" role="group" aria-label={t.kind}>
          <span className="label">{t.kind}</span>
          {KINDS.map((k) => <Button key={k} size="sm" variant={kind === k ? "default" : "outline"} aria-pressed={kind === k} disabled={!tracer.live} onClick={() => { setKind(k); change({ kind: k }); }} data-testid={`light-kind-${k}`}>{t[k]}</Button>)}
        </div>
        <span className="font-mono text-xs text-muted-foreground" data-testid="light-material-spp">{t.spp} {tracer.live ? spp.toLocaleString() : "–"}</span>
      </div>
      <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        <label className="flex items-center gap-3"><span className="label w-28 shrink-0">{t.roughness} {roughness.toFixed(2)}</span><Slider value={[roughness]} min={0.02} max={1} step={0.02} aria-label={t.roughness} disabled={!tracer.live || kind !== "metal"} onValueChange={(v) => { const x = Array.isArray(v) ? v[0] : v; setRoughness(x); change({ roughness: x }); }} /></label>
        <label className="flex items-center gap-3"><span className="label w-28 shrink-0">{t.ior} {ior.toFixed(2)}</span><Slider value={[ior]} min={1} max={2.4} step={0.02} aria-label={t.ior} disabled={!tracer.live || kind !== "glass"} onValueChange={(v) => { const x = Array.isArray(v) ? v[0] : v; setIor(x); change({ ior: x }); }} /></label>
      </div>
    </div>
  );
}
