"use client";

import { useEffect, useRef, useState } from "react";
import { ActivityColumns, HourTicks } from "./activity-chart";
import { useLabels } from "./labels";
import { ACTIVITIES, type Activity, activityShares, departureHistogram, generateCity, type Mode, PARAMS, peakDepartureShare, type SimEvent, World } from "./sim";
import { SWATCH } from "./use-city";
import { useVisible } from "./use-visible";

const MODES: Mode[] = ["fsm", "utility", "random"], PEOPLE = 300, FROM = 1440, UNTIL = 2880, CHUNK = 180;
/** The columns of day two start at 00:10, one every ten minutes: these are 01:00 and 12:00. */
const ONE_AM = 5, NOON = 71;
type Result = { shares: Float32Array[]; peak: number; trips: number };
/**
 * A run of one head for two days. The body clock only reaches the head that reads the needs: the timetable and the dice
 * never look at fatigue, so their days are the same with it or without it and are not run twice.
 */
type Job = "fsm" | "utility" | "random" | "utility-noclock";
const jobOf = (mode: Mode, clock: boolean): Job => (mode === "utility" && !clock ? "utility-noclock" : mode);

/**
 * Fig. 04: the three heads side by side. Each is the same 300 people run for two days by the reader's browser, without
 * a scene, a few simulated hours per frame so the page never stalls. The chart is day two: what everyone was doing.
 * Switching the body clock off runs the needs head once more, with fatigue growing at the same rate day and night.
 */
export function ModesLab() {
  const t = useLabels(), root = useRef<HTMLDivElement>(null), visible = useVisible(root);
  const [results, setResults] = useState<Partial<Record<Job, Result>>>({}), [clock, setClock] = useState(true);
  const queue = useRef<Job[]>(["fsm", "utility", "random"]), kick = useRef<() => void>(() => {});

  useEffect(() => {
    let raf = 0, job: Job | null = null, world: World | null = null, events: SimEvent[] = [], shares: Float32Array[] = [];
    const work = () => {
      raf = 0;
      if (!job && !queue.current.length) return; // nothing to do: the loop stops until a switch asks for more
      raf = requestAnimationFrame(work);
      if (!visible.current || !root.current || root.current.getBoundingClientRect().top > window.innerHeight) return; // nobody pays for this before they get here
      if (!world) {
        job = queue.current.shift() as Job;
        const mode: Mode = job === "utility-noclock" ? "utility" : job;
        world = new World(generateCity(1, 8), { agents: PEOPLE, mode, params: job === "utility-noclock" ? { ...PARAMS, circadian: 0 } : undefined });
        events = []; shares = [];
        world.onEvent = (e) => { if (e.type === "departed") events.push(e); };
      }
      for (let k = 0; k < CHUNK && world.t < UNTIL; k++) {
        world.tick();
        if (world.t > FROM && world.t % 10 === 0) shares.push(activityShares(world.agents));
      }
      if (world.t < UNTIL) return;
      const histogram = departureHistogram(events, FROM, UNTIL), done: Result = { shares, peak: peakDepartureShare(histogram, PEOPLE), trips: histogram.reduce((s, v) => s + v, 0) / PEOPLE }, key = job as Job;
      setResults((all) => ({ ...all, [key]: done }));
      world = null; job = null;
    };
    kick.current = () => { if (!raf) raf = requestAnimationFrame(work); };
    kick.current();
    return () => { cancelAnimationFrame(raf); kick.current = () => {}; };
  }, [visible]);

  const toggleClock = (on: boolean) => {
    setClock(on);
    if (!on && !results["utility-noclock"] && !queue.current.includes("utility-noclock")) { queue.current.push("utility-noclock"); kick.current(); }
  };
  const name = (k: Activity) => (k === "walking" ? t.walking : t.actions[k]), pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div ref={root} className="grid gap-4 text-sm">
      <label className="label flex min-h-6 items-center gap-2">
        <input type="checkbox" className="size-4 accent-[var(--signal)]" checked={clock} onChange={(e) => toggleClock(e.target.checked)} data-testid="modes-clock" />
        {t.bodyClock}
      </label>
      <div className="grid gap-4 sm:grid-cols-3" role="group" aria-label={t.modesChart}>
        {MODES.map((mode) => {
          const r = results[jobOf(mode, clock)], sleep = ACTIVITIES.indexOf("sleep");
          return (
            <div key={mode} className="grid gap-2" data-testid={`modes-${mode}`}>
              <p className="label text-foreground">{t.modes[mode]}</p>
              {r ? <ActivityColumns layers={[{ columns: r.shares }]} label={`${t.modes[mode]}: ${t.peakShort} ${pct(r.peak)}`} />
                : <div className="label grid h-28 place-items-center rounded-sm border border-border">{t.computing}</div>}
              <HourTicks />
              <p className="flex items-baseline justify-between gap-2"><span className="label">{t.peak} · {t.peakShort}</span><span className="font-mono text-lg tabular text-signal">{r ? pct(r.peak) : t.computing}</span></p>
              <p className="flex items-baseline justify-between gap-2"><span className="label">{t.tripsPerDay}</span><span className="font-mono text-sm tabular">{r ? `${r.trips.toFixed(1)} ${t.tripsUnit}` : "—"}</span></p>
              <p className="flex items-baseline justify-between gap-2" data-testid={`modes-${mode}-asleep`}><span className="label">{t.asleepAt}</span><span className="font-mono text-sm tabular">{r ? `${pct(r.shares[ONE_AM][sleep])} / ${pct(r.shares[NOON][sleep])}` : "—"}</span></p>
            </div>
          );
        })}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {ACTIVITIES.map((k) => <li key={k} className="label flex items-center gap-1.5"><span aria-hidden className={`size-2.5 rounded-full border border-border ${k === "walking" ? "bg-muted-foreground opacity-55" : k === "idle" ? "bg-foreground opacity-25" : SWATCH[k]}`} />{name(k)}</li>)}
      </ul>
    </div>
  );
}
