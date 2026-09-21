"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { BALL, studio as studioScene } from "@/lib/rt";
import { Stage, Transport } from "@/components/rt/stage";
import { useTracer } from "@/components/rt/use-tracer";
import { useLabels } from "./labels";

const NAMES = ["uniform", "cosine", "nee", "mis"] as const;
/** One colour per strategy, the same in the chart, the table and nowhere else: text stays in the text colours. */
const INK = ["var(--muted-foreground)", "var(--signal-3)", "var(--signal-2)", "var(--signal)"];
type Row = { error: number; mean: number };

/** Error against samples for the four tiles, log-log. Every line is direct-labelled at its end; the table below is the legend. */
function Chart({ history, names, label, x, y }: { history: { spp: number; tiles: Row[] }[]; names: string[]; label: string; x: string; y: string }) {
  const W = 340, H = 210, pad = { l: 30, r: 44, t: 10, b: 26 }, points = history.filter((h) => h.tiles.every((t) => t.error > 0));
  const xMax = Math.max(64, ...points.map((p) => p.spp)), errors = points.flatMap((p) => p.tiles.map((t) => t.error)), top = Math.max(1, ...errors) * 1.3, bottom = Math.min(top / 100, ...errors) * 0.8;
  const lx = (v: number) => pad.l + (Math.log2(Math.max(2, v) / 2) / Math.log2(xMax / 2)) * (W - pad.l - pad.r), ly = (v: number) => pad.t + (Math.log(top / Math.max(v, bottom)) / Math.log(top / bottom)) * (H - pad.t - pad.b);
  const ticks = [2, 8, 32, 128, 512, 2048].filter((n) => n <= xMax), last = points.at(-1);
  // End labels may not overlap: spread them at least 11 px apart, in the order of the lines.
  const ends = last ? last.tiles.map((t, i) => ({ i, y: ly(t.error) })).sort((a, b) => a.y - b.y) : [];
  for (let k = 1; k < ends.length; k++) ends[k].y = Math.max(ends[k].y, ends[k - 1].y + 11);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block h-auto w-full">
      {ticks.map((n) => <g key={n}><line x1={lx(n)} x2={lx(n)} y1={pad.t} y2={H - pad.b} className="stroke-border" strokeWidth={0.5} /><text x={lx(n)} y={H - 10} textAnchor="middle" className="fill-muted-foreground font-mono text-[9px]">{n}</text></g>)}
      <text x={W - pad.r} y={H - 1} textAnchor="end" className="fill-muted-foreground font-mono text-[9px]">{x} →</text>
      <text x={4} y={pad.t + 8} className="fill-muted-foreground font-mono text-[9px]">↑ {y}</text>
      {NAMES.map((_, i) => <polyline key={i} points={points.map((p) => `${lx(p.spp).toFixed(1)},${ly(p.tiles[i].error).toFixed(1)}`).join(" ")} fill="none" stroke={INK[i]} strokeWidth={2} strokeLinejoin="round" />)}
      {last && ends.map(({ i, y: at }) => <g key={i}><circle cx={lx(last.spp)} cy={ly(last.tiles[i].error)} r={3} fill={INK[i]} stroke="var(--card)" strokeWidth={1.5} /><text x={lx(last.spp) + 7} y={at + 3} className="fill-foreground text-[9px]">{names[i]}</text></g>)}
    </svg>
  );
}

/**
 * Figure 1: the same room four times from the same number of samples; the tiles differ only in how a path chooses where
 * to go (kernel.ts, `strategy`). Each tile's error is measured as in article 1, per tile; its mean brightness is shown
 * too, because the four must agree on it.
 */
export function RaceLab({ studio = false }: { /** article 2's room of three balls, with the lamp's size and the middle ball's roughness to choose */ studio?: boolean }) {
  const t = useLabels(), root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [spp, setSpp] = useState(0), [history, setHistory] = useState<{ spp: number; tiles: Row[] }[]>([]);
  const [lamp, setLamp] = useState(0.3), [roughness, setRoughness] = useState(0.3);
  const track = useRef({ next: 2, history: [] as { spp: number; tiles: Row[] }[] });
  const fresh = () => { track.current = { next: 2, history: [] }; setHistory([]); };
  const tracer = useTracer(root, canvas, {
    ...(studio ? { studio: { lamp, ball: { roughness } } } : { triangles: 1_000 }), size: 512, doublingMs: 450, maxSamples: 2048,
    configure: (r) => { r.quad = "strategies"; r.bounces = 16; },
    afterFrame: async (r) => {
      const k = track.current;
      if (r.samples < k.next / 2) { k.next = 2; k.history = []; }
      if (r.samples >= k.next) { k.next = Math.max(k.next + 1, Math.ceil(r.samples * Math.SQRT2)); k.history = [...k.history, { spp: r.samples, tiles: await r.errorByTile() }]; setHistory(k.history); }
      setSpp(r.samples);
    },
  });
  const names = NAMES.map((n) => t[n]), now = history.at(-1)?.tiles, base = now?.[1].error;

  return (
    <div ref={root} className="grid gap-5 text-sm">
      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <Stage canvas={canvas} status={tracer.status} label={t.racePicture} t={t} testid="sampling-race-canvas">
          <div className="pointer-events-none absolute inset-0 grid grid-cols-2 grid-rows-2">
            {names.map((name) => <span key={name} className="m-2 self-end justify-self-start rounded-sm bg-black/65 px-1.5 py-0.5 text-xs text-white">{name}</span>)}
          </div>
        </Stage>
        <div className="grid min-w-0 grid-cols-1 gap-3">
          <Chart history={history} names={t.short} label={t.chart} x={t.chartX} y={t.chartY} />
          <table className="w-full text-xs tabular" data-testid="sampling-race-table">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1 font-normal" /><th className="py-1 text-right font-normal">{t.error}</th><th className="py-1 text-right font-normal">{t.worth}</th><th className="py-1 text-right font-normal">{t.mean}</th></tr></thead>
            <tbody>
              {names.map((name, i) => (
                <tr key={name} className="border-t border-border">
                  <td className="py-1.5"><span className="mr-2 inline-block size-2.5 rounded-full align-middle" style={{ background: INK[i] }} aria-hidden />{name}</td>
                  <td className="py-1.5 text-right font-mono">{now ? `${(now[i].error * 100).toFixed(now[i].error < 0.1 ? 1 : 0)}%` : "–"}</td>
                  <td className="py-1.5 text-right font-mono">{now && base ? `${((base / now[i].error) ** 2).toFixed((base / now[i].error) ** 2 < 10 ? 1 : 0)} ${t.worthUnit}` : "–"}</td>
                  <td className="py-1.5 text-right font-mono">{now ? now[i].mean.toFixed(3) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
        <Transport status={tracer.status} live={tracer.live} onToggle={tracer.toggle} onRestart={() => { fresh(); tracer.restart(); }} t={t} />
        {studio && (
          <>
            <div className="flex items-center gap-2" role="group" aria-label={t.lamp}>
              <span className="label">{t.lamp}</span>
              {([[0.06, t.lampSmall], [0.3, t.lampMedium], [0.7, t.lampLarge]] as const).map(([size, name]) => <Button key={size} size="sm" variant={lamp === size ? "default" : "outline"} aria-pressed={lamp === size} disabled={tracer.unavailable} onClick={() => { fresh(); setLamp(size); tracer.rebuild(); }} data-testid={`sampling-lamp-${size}`}>{name}</Button>)}
            </div>
            <div className="flex items-center gap-2" role="group" aria-label={t.ball}>
              <span className="label">{t.ball}</span>
              {([[0.08, t.smooth], [0.3, "0.3"], [0.7, t.rough]] as const).map(([value, name]) => <Button key={value} size="sm" variant={roughness === value ? "default" : "outline"} aria-pressed={roughness === value} disabled={!tracer.live} onClick={() => { fresh(); setRoughness(value); tracer.renderer.current?.setMaterial(BALL, { ...studioScene().materials[BALL], roughness: value }); tracer.restart(); }}>{name}</Button>)}
            </div>
          </>
        )}
        <span className="font-mono text-xs text-muted-foreground" data-testid="sampling-race-spp">{t.spp} {tracer.live ? spp.toLocaleString() : "–"} / 2,048</span>
      </div>
      <p className="text-muted-foreground">{t.raceNote}</p>
    </div>
  );
}
