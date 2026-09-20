"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLabels } from "./labels";
import { type Action, generateCity, PARAMS, sunAltitude, World } from "./sim";
import { FILL, SWATCH } from "./use-city";

const DAYS = 3, EVERY = 5, W = 720, ROW = 46;

/** One person followed for three days, worked out in the reader's browser: no scene, just the simulation. */
function follow(seed: number, duty: boolean) {
  const world = new World(generateCity(1, 8), { agents: 1, seed, duty }), a = world.agents[0];
  const needs: number[][] = [[], [], [], []], doing: (Action | "walking" | null)[] = [];
  for (let k = 0; k < DAYS * 1440; k++) {
    world.tick();
    if (k % EVERY === 0) { a.needs.forEach((v, i) => needs[i].push(v)); doing.push(a.state === "traveling" ? "walking" : a.state === "acting" ? a.action : null); }
  }
  const n = doing.length;
  // Night is where the sun is below the horizon; the world starts at 06:00.
  const nights: [number, number][] = [];
  for (let k = 0, start = -1; k <= n; k++) {
    const dark = k < n && sunAltitude(((PARAMS.startMinute + k * EVERY) / 60) % 24) < 0;
    if (dark && start < 0) start = k; else if (!dark && start >= 0) { nights.push([start, k]); start = -1; }
  }
  const runs: { from: number; to: number; what: Action | "walking" }[] = [];
  doing.forEach((d, k) => { if (!d) return; const last = runs[runs.length - 1]; if (last && last.what === d && last.to === k) last.to = k + 1; else runs.push({ from: k, to: k + 1, what: d }); });

  return { needs, nights, runs, n };
}

/** Fig. 02: four needs, their thresholds, and what the person did about them. (The React Compiler memoises `follow`.) */
export function NeedsLab() {
  const t = useLabels(), [seed, setSeed] = useState(3), [duty, setDuty] = useState(true);
  const { needs, nights, runs, n } = follow(seed, duty), x = (k: number) => (k / n) * W;
  return (
    <div className="grid gap-3 text-sm">
      <svg viewBox={`0 0 ${W} ${ROW * 4 + 22}`} className="w-full text-foreground" role="img" aria-label={t.needsChart}>
        {nights.map(([a, b], k) => <rect key={k} x={x(a)} width={x(b) - x(a)} y={0} height={ROW * 4} className="fill-muted" opacity={0.55} />)}
        {needs.map((series, i) => (
          <g key={i} transform={`translate(0 ${i * ROW})`}>
            <line x1={0} x2={W} y1={ROW - 2} y2={ROW - 2} className="stroke-border" />
            <line x1={0} x2={W} y1={4 + (1 - PARAMS.threshold[i]) * (ROW - 8)} y2={4 + (1 - PARAMS.threshold[i]) * (ROW - 8)} className="stroke-signal-2" strokeDasharray="3 4" strokeWidth={1} />
            <polyline fill="none" className="stroke-signal" strokeWidth={1.6} points={series.map((v, k) => `${x(k).toFixed(1)},${(4 + (1 - v) * (ROW - 8)).toFixed(1)}`).join(" ")} />
            <text x={4} y={13} className="fill-current font-mono text-[10px]">{t.needNames[i]}</text>
          </g>
        ))}
        <g transform={`translate(0 ${ROW * 4 + 4})`}>
          {runs.map((r, k) => <rect key={k} x={x(r.from)} width={Math.max(0.5, x(r.to) - x(r.from))} height={8} className={FILL[r.what]} opacity={r.what === "walking" ? 0.5 : 1} />)}
        </g>
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {(["sleep", "eat", "social", "work"] as const).map((k) => (
            <li key={k} className="label flex items-center gap-1.5"><span aria-hidden className={`size-2.5 rounded-full ${SWATCH[k]}`} />{t.actions[k]}</li>
          ))}
          <li className="label flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-full bg-muted-foreground opacity-50" />{t.walking}</li>
          <li className="label flex items-center gap-1.5"><span aria-hidden className="w-4 border-t border-dashed border-signal-2" />{t.threshold}</li>
        </ul>
        <div className="flex items-center gap-3">
          <label className="label flex min-h-6 items-center gap-2"><input type="checkbox" className="size-4 accent-[var(--signal)]" checked={duty} onChange={(e) => setDuty(e.target.checked)} />{t.duty}</label>
          <Button size="sm" variant="outline" onClick={() => setSeed((v) => v + 1)} data-testid="needs-another">{t.anotherPerson}</Button>
        </div>
      </div>
    </div>
  );
}
