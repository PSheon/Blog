"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Button } from "@/components/ui/button";
import { mulberry32 } from "@/lib/ml";
import { type Match, icp } from "./icp";
import { useLabels } from "./labels";

import { Param } from "@/components/lab/param";
import { type Pose, between, wrap } from "./se2";
import { CYAN_HEX, PINK_HEX, type Stage3D, setPoints, stubs, useStage3D, tone } from "./stage3d";
import { useVisible } from "./use-visible";
import { RING, scan } from "./world";

type Place = "corner" | "corridor";
/** Where the first scan was taken, and where the second one really was. */
/** …and where the cyan scan starts out: a start ICP recovers from at the corner, and one it does not in the corridor. */
const PLACES: Record<Place, { a: Pose; b: Pose; start: Pose }> = {
  corner: { a: { x: 18, y: 2, theta: 0 }, b: { x: 18.3, y: 2.35, theta: 0.25 }, start: { x: 1.6, y: -1.2, theta: 0.5 } },
  corridor: { a: { x: 10.5, y: 12, theta: Math.PI }, b: { x: 10.1, y: 12.15, theta: Math.PI + 0.1 }, start: { x: -2, y: 0, theta: 0 } },
};

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
  const drag = useRef<[number, number] | null>(null), playing = useRef<number | null>(null), dice = useRef(mulberry32(11));

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

  const live = useStage3D(
    view, visible,
    (stage) => {
      const T = stage.T;
      stage.aim(0, 0.6, 9, 15);
      const marker = (color: number | import("three").Color) => { const m = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 0.1, 20), new T.MeshStandardMaterial({ color })); m.rotation.x = Math.PI / 2; stage.scene.add(m); return m; };
      return { target: stage.line(stage.ink, 0.9, true), source: stage.line(tone(CYAN_HEX), 1, true), here: marker(stage.ink), there: marker(tone(CYAN_HEX)), unsure: stage.line(tone(PINK_HEX)) };
    },
    (stage, o) => {
      setPoints(stage.T, o.target, stubs(scans.target, { x: 0, y: 0, theta: 0 }, 0.7));
      setPoints(stage.T, o.source, stubs(scans.source, guess, 0.7));
      o.here.position.set(0, 0, 0.05); o.there.position.set(guess.x, guess.y, 0.05);
      setPoints(stage.T, o.unsure, result ? ellipse(guess.x, guess.y, result.information, 100) : []);
    },
    { grid: [0, 0] },
  );
  const floor = (stage: Stage3D | undefined, e: { clientX: number; clientY: number }) => stage?.floorPoint(e.clientX, e.clientY) ?? null;

  const off = Math.hypot(guess.x - scans.truth.x, guess.y - scans.truth.y);
  return (
    <div ref={root} className="grid gap-4 text-sm">
      <canvas
        ref={view}
        // Focusable, with the arrow keys doing what a drag does: moving the scan was pointer-only before.
        role="application"
        tabIndex={0}
        aria-label={`${t.picAlign}${t.keysHint}`}
        onKeyDown={(e) => {
          const move: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
          const d = move[e.key];
          if (!d) return;
          e.preventDefault(); // or the page scrolls
          stop();
          const by = e.shiftKey ? 0.5 : 0.1;
          setGuess((g) => ({ ...g, x: g.x + d[0] * by, y: g.y + d[1] * by })); setResult(null); setStep(0);
        }}
        className="aspect-[16/9] w-full cursor-grab touch-none rounded-md border border-border text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        onPointerDown={(e) => { stop(); drag.current = floor(live.current?.stage, e); e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => {
          const now = floor(live.current?.stage, e);
          if (!drag.current || !now) return;
          const [dx, dy] = [now[0] - drag.current[0], now[1] - drag.current[1]];
          drag.current = now;
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

/** One-sigma ellipse of the position part of an information matrix (inverse covariance), magnified, as a closed ring on the floor. */
function ellipse(cx: number, cy: number, information: number[], magnify: number): number[] {
  const a = information[0], b = information[1], d = information[4], det = a * d - b * b;
  if (det <= 1e-9) return [];
  const ca = d / det, cb = -b / det, cd = a / det, mean = (ca + cd) / 2, spread = Math.hypot((ca - cd) / 2, cb);
  // 3 cm of point noise turns "per unit variance" into metres
  const major = Math.min(12, Math.sqrt(mean + spread) * 0.03 * magnify), minor = Math.min(12, Math.sqrt(Math.max(1e-12, mean - spread)) * 0.03 * magnify), angle = 0.5 * Math.atan2(2 * cb, ca - cd);
  const out: number[] = [];
  for (let k = 0; k <= 48; k++) {
    const u = (k / 48) * 2 * Math.PI, ex = major * Math.cos(u), ey = minor * Math.sin(u);
    out.push(cx + ex * Math.cos(angle) - ey * Math.sin(angle), cy + ex * Math.sin(angle) + ey * Math.cos(angle), 0.06);
  }
  return out;
}
