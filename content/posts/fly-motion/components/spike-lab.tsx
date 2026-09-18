"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { mulberry32 } from "@/lib/ml";
import { FlyNet } from "./model";
import { type Clip, GRID, STEPS, grating, randomClip } from "./stimulus";
import { type Wiring, columnX, columnY } from "./wiring";

const BATCH = 16, NAMES = ["T4a", "T4b", "T4c", "T4d", "T5a", "T5b", "T5c", "T5d"];
/** Mi9→Mi4 (T4) and Tm9→Tm1 (T5) axes measured from the connectome, in degrees. */
const ANATOMY = [173, 355, 75, 277, 178, 352, 72, 282];
const ANGLES = Array.from({ length: 12 }, (_, i) => (i * Math.PI) / 6);

interface Tuning { angle: number; dsi: number }

/** Throwaway first version: does the connectome-wired network learn in a real browser, and what do its detectors end up preferring? */
export function SpikeLab() {
  const eye = useRef<HTMLCanvasElement>(null), dials = useRef<HTMLCanvasElement>(null);
  const [wiring, setWiring] = useState<Wiring>("real");
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState({ seen: 0, acc: 0, perSec: 0, guess: -1, truth: -1 });
  const state = useRef<{ net: FlyNet; rng: () => number; test: Clip[]; show: Clip; inBatch: number; trainMs: number; tuning: Tuning[] } | null>(null);

  const reset = (kind: Wiring) => {
    const testRng = mulberry32(999);
    const test = Array.from({ length: 32 }, () => randomClip(testRng));
    state.current = { net: new FlyNet(kind, mulberry32(7)), rng: mulberry32(1), test, show: test[0], inBatch: 0, trainMs: 0, tuning: [] };
  };
  const rewire = (kind: Wiring) => {
    reset(kind);
    setWiring(kind);
    setRunning(false);
    setStats({ seen: 0, acc: 0, perSec: 0, guess: -1, truth: -1 });
  };

  useEffect(() => {
    if (!state.current) reset(wiring);
    const s = state.current!;
    let frame = 0, tick = 0, lastMeasure = 0;
    const measure = () => {
      const probe = mulberry32(5);
      const resp = ANGLES.map((a) => s.net.detectors(grating(a, 4 + probe() * 4, 1 + probe() * 3, probe() * 6.28)));
      s.tuning = NAMES.map((_, i) => {
        let x = 0, y = 0, n = 0;
        ANGLES.forEach((a, k) => { x += resp[k][i] * Math.cos(a); y += resp[k][i] * Math.sin(a); n += resp[k][i]; });
        return { angle: Math.atan2(y, x), dsi: Math.hypot(x, y) / Math.max(n, 1e-9) };
      });
      s.show = s.test[Math.floor(Math.random() * s.test.length)];
      setStats({ seen: s.net.seen, acc: s.net.accuracy(s.test), perSec: s.trainMs ? (s.net.seen / s.trainMs) * 1000 : 0, guess: s.net.predict(s.show.frames), truth: s.show.label });
    };
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (running) {
        const t0 = performance.now();
        do {
          s.net.accumulate(randomClip(s.rng), BATCH);
          if (++s.inBatch === BATCH) { s.net.apply(); s.inBatch = 0; }
        } while (performance.now() - t0 < 10);
        s.trainMs += performance.now() - t0;
      }
      if (now - lastMeasure > (running ? 1500 : 4000)) { lastMeasure = now; measure(); }
      drawEye(eye.current, s.show.frames[Math.floor(tick++ / 3) % STEPS]);
      drawDials(dials.current, s.tuning);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [running, wiring]);

  const arrow = (d: number) => (d < 0 ? "–" : ["→", "↑", "←", "↓"][d]);
  return (
    <div className="grid gap-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <canvas ref={eye} width={360} height={360} className="w-full rounded-md border border-border" aria-label="What the eye sees" />
        <canvas ref={dials} width={520} height={360} className="w-full rounded-md border border-border" aria-label="Preferred direction of each detector type" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Train"}</Button>
        <label className="flex items-center gap-2">
          wiring
          <select className="rounded border border-border bg-background px-1 py-0.5" value={wiring} onChange={(e) => rewire(e.target.value as Wiring)}>
            <option value="real">real connectome</option>
            <option value="symmetric">symmetrised</option>
            <option value="shuffled">shuffled</option>
          </select>
        </label>
      </div>
      <p className="tabular text-muted-foreground" data-testid="fly-stats">
        {stats.seen} clips · accuracy {(stats.acc * 100).toFixed(0)}% · {stats.perSec.toFixed(0)} clips/s · this clip moves {arrow(stats.truth)}, the network says {arrow(stats.guess)}
      </p>
    </div>
  );
}

function drawEye(canvas: HTMLCanvasElement | null, lum: Float64Array) {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  const mid = (GRID - 1) / 2, scale = canvas.width / (GRID * Math.sqrt(3) * 1.05);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let u = 0; u < GRID; u++)
    for (let v = 0; v < GRID; v++) {
      const x = canvas.width / 2 + (columnX(u, v) - columnX(mid, mid)) * scale, y = canvas.height / 2 - (columnY(u, v) - columnY(mid, mid)) * scale;
      const l = Math.round(lum[u * GRID + v] * 255);
      ctx.fillStyle = `rgb(${l},${l},${l})`;
      ctx.beginPath(); ctx.arc(x, y, scale * 0.48, 0, Math.PI * 2); ctx.fill();
    }
}

/** One dial per detector type: faint line = the axis its wiring points along, arrow = what it prefers after training (length = selectivity). */
function drawDials(canvas: HTMLCanvasElement | null, tuning: Tuning[]) {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  const css = getComputedStyle(canvas), ink = css.color;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "13px ui-monospace, monospace"; ctx.textAlign = "center";
  NAMES.forEach((name, i) => {
    const cx = 65 + (i % 4) * 130, cy = 85 + Math.floor(i / 4) * 175, r = 52, a = (ANATOMY[i] * Math.PI) / 180;
    ctx.strokeStyle = ink; ctx.globalAlpha = 0.25; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r, cy - Math.sin(a) * r); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.fillStyle = ink; ctx.fillText(name, cx, cy + r + 20);
    const t = tuning[i];
    if (!t || t.dsi < 0.01) return;
    const len = r * Math.min(1, t.dsi * 1.6), ex = cx + Math.cos(t.angle) * len, ey = cy - Math.sin(t.angle) * len;
    ctx.strokeStyle = i < 4 ? "#79dafa" : "#ff6e96"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI * 2); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
  });
}
