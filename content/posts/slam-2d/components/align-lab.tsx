"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Button } from "@/components/ui/button";
import { mulberry32 } from "@/lib/ml";
import { type Match, icp } from "./icp";
import { useLabels } from "./labels";
import { CYAN, PINK, prepare } from "./paint";
import { Param } from "./param";
import { type Pose, between, transformPoints, wrap } from "./se2";
import { useVisible } from "./use-visible";
import { RING, scan } from "./world";

type Place = "corner" | "corridor";
/** Where the first scan was taken, and where the second one really was. */
/** …and where the cyan scan starts out: a start ICP recovers from at the corner, and one it does not in the corridor. */
const PLACES: Record<Place, { a: Pose; b: Pose; start: Pose }> = {
  corner: { a: { x: 18, y: 2, theta: 0 }, b: { x: 18.3, y: 2.35, theta: 0.25 }, start: { x: 1.6, y: -1.2, theta: 0.5 } },
  corridor: { a: { x: 10.5, y: 12, theta: Math.PI }, b: { x: 10.1, y: 12.15, theta: Math.PI + 0.1 }, start: { x: -2, y: 0, theta: 0 } },
};
const SCALE = 17;

/** Fig. 03: line one scan up with another by hand, then watch ICP do it — at a corner, and in a bare corridor. */
export function AlignLab() {
  const t = useLabels();
  const root = useRef<HTMLDivElement>(null), view = useRef<HTMLCanvasElement>(null), visible = useVisible(root);
  const [place, setPlace] = useState<Place>("corner");
  const scans = useMemo(() => {
    const rng = mulberry32(3), { a, b } = PLACES[place];
    return { target: scan(RING, a, rng).points, source: scan(RING, b, rng).points, truth: between(a, b) };
  }, [place]);
  const [guess, setGuess] = useState<Pose>(PLACES.corner.start);
  const [result, setResult] = useState<Match | null>(null);
  const [step, setStep] = useState(0);
  const drag = useRef<{ x: number; y: number } | null>(null), playing = useRef<number | null>(null), dice = useRef(mulberry32(11));

  const stop = () => { if (playing.current !== null) { clearInterval(playing.current); playing.current = null; } };
  const choose = (p: Place) => { stop(); setPlace(p); setGuess(PLACES[p].start); setResult(null); setStep(0); };
  const scramble = () => { stop(); const r = dice.current; setGuess({ x: (r() - 0.5) * 5, y: (r() - 0.5) * 3, theta: (r() - 0.5) * 1.2 }); setResult(null); setStep(0); };
  const run = () => {
    stop();
    const from = guess;
    let k = 0;
    playing.current = window.setInterval(() => {
      k++;
      // Re-run from the hand-placed start with one more step allowed each time: that is exactly ICP's k-th iterate.
      const m = icp(scans.target, scans.source, from, { maxIterations: k, gate: 3 });
      setGuess(m.pose); setResult(m); setStep(k);
      if (m.iterations < k || k >= 30) stop();
    }, 140);
  };
  useEffect(() => stop, []);

  useEffect(() => {
    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      if (!visible.current) return;
      const p = prepare(view.current);
      if (!p) return;
      const { ctx, ink, w, h } = p, px = (x: number) => w / 2 + x * SCALE, py = (y: number) => h / 2 - y * SCALE;
      const draw = (pts: Float64Array, color: string, size: number) => { ctx.fillStyle = color; for (let i = 0; i < pts.length; i += 2) ctx.fillRect(px(pts[i]) - size / 2, py(pts[i + 1]) - size / 2, size, size); };
      draw(scans.target, ink, 2.5);
      draw(transformPoints(guess, scans.source), CYAN, 2.5);
      ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(px(0), py(0), 4, 0, 7); ctx.fill();
      ctx.fillStyle = CYAN; ctx.beginPath(); ctx.arc(px(guess.x), py(guess.y), 4, 0, 7); ctx.fill();
      if (result) ellipse(ctx, px(guess.x), py(guess.y), result.information, SCALE * 30);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [scans, guess, result, visible]);

  const off = Math.hypot(guess.x - scans.truth.x, guess.y - scans.truth.y);
  return (
    <div ref={root} className="grid gap-4 text-sm">
      <canvas
        ref={view}
        className="aspect-[16/9] w-full cursor-grab touch-none rounded-md border border-border text-foreground active:cursor-grabbing"
        onPointerDown={(e) => { stop(); drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dx = (e.clientX - drag.current.x) / SCALE, dy = -(e.clientY - drag.current.y) / SCALE;
          drag.current = { x: e.clientX, y: e.clientY };
          setGuess((g) => ({ ...g, x: g.x + dx, y: g.y + dy })); setResult(null); setStep(0);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      />
      <p className="text-muted-foreground">{t.dragHint} {result && t.unsure}</p>
      <div className="grid items-end gap-4 sm:grid-cols-[auto_1fr_auto]">
        <div className="flex items-center gap-2" role="group" aria-label={t.place}>
          {(["corner", "corridor"] as const).map((p) => <Button key={p} size="sm" variant={place === p ? "default" : "outline"} onClick={() => choose(p)}>{t[p]}</Button>)}
        </div>
        <Param label={t.rotate} shown={`${((guess.theta * 180) / Math.PI).toFixed(0)}${t.degrees}`} value={guess.theta} min={-1.2} max={1.2} step={0.01} onChange={(theta) => { stop(); setGuess((g) => ({ ...g, theta: wrap(theta) })); setResult(null); setStep(0); }} />
        <div className="flex gap-2">
          <Button size="sm" onClick={run}>{t.runIcp}</Button>
          <Button size="sm" variant="ghost" onClick={scramble}>{t.scramble}</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Readout label={t.off} value={off.toFixed(2)} unit={t.metres} large />
        <Readout label={t.iteration} value={step} tone="plain" />
        <Readout label={t.fit} value={result && Number.isFinite(result.rms) ? (result.rms * 100).toFixed(1) : "–"} unit="cm" tone="plain" />
        <Readout label={t.matched} value={result ? `${Math.round(result.inliers * 100)}%` : "–"} tone="plain" />
      </div>
    </div>
  );
}

/** One-sigma ellipse of the position part of an information matrix (inverse covariance), magnified. */
function ellipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, information: number[], magnify: number) {
  const a = information[0], b = information[1], d = information[4], det = a * d - b * b;
  if (det <= 1e-9) return;
  const ca = d / det, cb = -b / det, cd = a / det, mean = (ca + cd) / 2, spread = Math.hypot((ca - cd) / 2, cb);
  const major = Math.sqrt(mean + spread) * 0.03 * magnify, minor = Math.sqrt(Math.max(1e-12, mean - spread)) * 0.03 * magnify, angle = 0.5 * Math.atan2(2 * cb, ca - cd);
  ctx.strokeStyle = PINK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(cx, cy, Math.min(major, 400), Math.min(minor, 400), -angle, 0, Math.PI * 2); ctx.stroke();
}
