"use client";

import { useEffect, useRef, useState } from "react";
import { useLabels } from "./labels";
import { departureHistogram, generateCity, type Mode, peakDepartureShare, type SimEvent, World } from "./sim";
import { FILL, SWATCH } from "./use-city";
import { useVisible } from "./use-visible";

const MODES: Mode[] = ["fsm", "utility", "random"], PEOPLE = 300, FROM = 1440, UNTIL = 2880, CHUNK = 180;
/** Bottom to top of each column. */
const STACK = ["sleep", "work", "eat", "social", "walking", "idle"] as const;
type Kind = (typeof STACK)[number];
type Result = { shares: number[][]; peak: number; trips: number };

/**
 * Fig. 04: the three heads side by side. Each is the same 300 people run for two days by the reader's browser, without
 * a scene, a few simulated hours per frame so the page never stalls. The chart is day two: what everyone was doing.
 */
export function ModesLab() {
  const t = useLabels(), root = useRef<HTMLDivElement>(null), visible = useVisible(root), [results, setResults] = useState<(Result | null)[]>([null, null, null]);

  useEffect(() => {
    let raf = 0, index = 0, world: World | null = null, events: SimEvent[] = [], shares: number[][] = [];
    const work = () => {
      if (index >= MODES.length) return;
      raf = requestAnimationFrame(work);
      if (!visible.current || !root.current || root.current.getBoundingClientRect().top > window.innerHeight) return; // nobody pays for this before they get here
      if (!world) { world = new World(generateCity(1, 8), { agents: PEOPLE, mode: MODES[index] }); events = []; shares = []; world.onEvent = (e) => { if (e.type === "departed") events.push(e); }; }
      for (let k = 0; k < CHUNK && world.t < UNTIL; k++) {
        world.tick();
        if (world.t > FROM && world.t % 10 === 0) {
          const counts = STACK.map(() => 0);
          for (const a of world.agents) counts[STACK.indexOf(a.state === "traveling" ? "walking" : a.state === "acting" && a.action ? a.action : "idle")]++;
          shares.push(counts.map((c) => c / PEOPLE));
        }
      }
      if (world.t < UNTIL) return;
      const histogram = departureHistogram(events, FROM, UNTIL), at = index, done = shares;
      setResults((all) => all.map((r, k) => (k === at ? { shares: done, peak: peakDepartureShare(histogram, PEOPLE), trips: histogram.reduce((s, v) => s + v, 0) / PEOPLE } : r)));
      world = null; index++;
    };
    raf = requestAnimationFrame(work);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  const name = (k: Kind) => (k === "walking" ? t.walking : t.actions[k]);
  return (
    <div ref={root} className="grid gap-4 text-sm">
      <div className="grid gap-4 sm:grid-cols-3" role="group" aria-label={t.modesChart}>
        {MODES.map((mode, i) => {
          const r = results[i];
          return (
            <div key={mode} className="grid gap-2" data-testid={`modes-${mode}`}>
              <p className="label text-foreground">{t.modes[mode]}</p>
              <svg viewBox="0 0 144 60" preserveAspectRatio="none" className="h-28 w-full rounded-sm border border-border" role="img" aria-label={r ? `${t.modes[mode]}: ${t.peakShort} ${Math.round(r.peak * 100)}%` : t.computing}>
                {r?.shares.map((column, x) => {
                  let y = 60;
                  return column.map((share, k) => { const h = share * 60; y -= h; return h > 0.05 ? <rect key={`${x}-${k}`} x={x} width={1.02} y={y} height={h} className={FILL[STACK[k]]} opacity={STACK[k] === "walking" ? 0.55 : STACK[k] === "idle" ? 0.25 : 1} /> : null; });
                })}
              </svg>
              <div className="label flex justify-between"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
              <p className="flex items-baseline justify-between gap-2"><span className="label">{t.peak} · {t.peakShort}</span><span className="font-mono text-lg tabular text-signal">{r ? `${Math.round(r.peak * 100)}%` : t.computing}</span></p>
              <p className="flex items-baseline justify-between gap-2"><span className="label">{t.tripsPerDay}</span><span className="font-mono text-sm tabular">{r ? `${r.trips.toFixed(1)} ${t.tripsUnit}` : "—"}</span></p>
            </div>
          );
        })}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {STACK.map((k) => <li key={k} className="label flex items-center gap-1.5"><span aria-hidden className={`size-2.5 rounded-full border border-border ${k === "walking" ? "bg-muted-foreground opacity-55" : k === "idle" ? "bg-foreground opacity-25" : SWATCH[k]}`} />{name(k)}</li>)}
      </ul>
    </div>
  );
}
