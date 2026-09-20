"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { useReducedMotion } from "@/components/lab/use-reduced-motion";
import { Button } from "@/components/ui/button";
import type { CityView, PeopleColors } from "./city-view3d";
import { useLabels } from "./labels";
import { formatTime, generateCity, modalShare, type Mode, PARAMS, World } from "./sim";
import { useVisible } from "./use-visible";

const RATES = [1, 5, 20], MODES: Mode[] = ["utility", "fsm", "random"];
/** One colour per activity, shared by the people in the scene and the legend: the data-series tokens, in their dark values. */
const SWATCH = { work: "bg-chart-1", eat: "bg-chart-2", social: "bg-chart-5", sleep: "bg-chart-4", idle: "bg-foreground" } as const;
const TOKEN: Record<keyof typeof SWATCH, string> = { work: "--chart-1", eat: "--chart-2", social: "--chart-5", sleep: "--chart-4", idle: "--foreground" };
/** At most this many simulated minutes per frame: a slow frame drops simulated time instead of snowballing. */
const MAX_TICKS = 40;

/**
 * The city and the people in it. three.js is fetched the first time the figure is on screen; the canvas holds its place
 * until then. The simulation runs in whole simulated minutes; the picture is drawn in between them.
 */
export function CityLab({ seed = 1, n = 8, agents = 300, modes = false }: { seed?: number; n?: number; agents?: number; modes?: boolean }) {
  const t = useLabels(), reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), visible = useVisible(root);
  const [playing, setPlaying] = useState<boolean | null>(null), [rate, setRate] = useState(1), [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("utility"), [duty, setDuty] = useState(true);
  const [shown, setShown] = useState({ clock: formatTime(PARAMS.startMinute), frame: 0, calls: 0, sync: 0, people: 0 });
  // Under reduced motion the clock starts paused and the camera never circles.
  const running = playing ?? !reduced, live = useRef({ running, rate, reduced, mode, duty });
  useEffect(() => { live.current = { running, rate, reduced, mode, duty }; });

  useEffect(() => {
    let cancelled = false, loading = false, raf = 0, view: CityView | null = null, world: World | null = null, last = 0, pending = 0, dirty = true;
    let px = new Float64Array(0), py = new Float64Array(0), spent = 0, frames = 0, since = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible.current || document.hidden) { last = 0; return; }
      if (!view || !world) {
        if (loading || !canvas.current) return;
        loading = true;
        void Promise.all([import("three"), import("./city-view3d")]).then(([T, { CityView }]) => {
          if (cancelled || !canvas.current) return;
          const city = generateCity(seed, n), style = getComputedStyle(canvas.current);
          // A phone gets a third of the crowd: the picture is a third of the size.
          world = new World(city, { agents: window.innerWidth < 640 ? Math.min(agents, 100) : agents });
          px = Float64Array.from(world.x); py = Float64Array.from(world.y);
          view = new CityView(T, canvas.current, city);
          view.setPeople(world.agents.length, Object.fromEntries(Object.entries(TOKEN).map(([k, v]) => [k, style.getPropertyValue(v).trim()])) as PeopleColors);
          setReady(true);
        });
        return;
      }
      const started = performance.now(), dt = last ? Math.min(0.1, (now - last) / 1000) : 0, now_ = live.current;
      last = now;
      if (world.mode !== now_.mode) { world.setMode(now_.mode); dirty = true; }
      if (world.duty !== now_.duty) { world.setDuty(now_.duty); dirty = true; }
      if (now_.running) {
        pending += dt * PARAMS.minutesPerSecond * now_.rate;
        for (let k = 0; pending >= 1 && k < MAX_TICKS; k++, pending--) { px.set(world.x); py.set(world.y); world.tick(); }
        if (pending >= 1) pending = 0;
        dirty = true;
      }
      const orbiting = now_.running && !now_.reduced;
      if (dirty || orbiting) { view.setTime(world.t + pending); view.updatePeople(world, px, py, pending); view.render(dt, orbiting); dirty = false; }
      spent += performance.now() - started; frames++;
      if (now - since >= 1000) { setShown({ clock: formatTime(world.t), frame: spent / frames, calls: view.calls, sync: modalShare(world.agents), people: world.agents.length }); spent = 0; frames = 0; since = now; }
    };
    const onResize = () => { dirty = true; };
    window.addEventListener("resize", onResize);
    raf = requestAnimationFrame(loop);
    return () => { cancelled = true; cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); view?.dispose(); };
  }, [seed, n, agents, visible]);

  return (
    <div ref={root} className="grid gap-3 text-sm">
      {/* The scene has its own sky, so it and its colours stay the same in both themes. */}
      <div className="dark relative">
        <canvas ref={canvas} role="img" aria-label={t.scene} className="aspect-[4/5] w-full rounded-sm bg-[#070918] sm:aspect-[16/9]" data-testid="city-canvas" />
        {!ready && <p className="label absolute inset-0 grid place-items-center text-muted-foreground">{t.loading}</p>}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label={t.legend}>
        {(Object.keys(SWATCH) as (keyof typeof SWATCH)[]).map((k) => (
          <li key={k} className="label flex items-center gap-1.5">
            <span className="dark contents"><span aria-hidden className={`size-2.5 rounded-full border border-border ${SWATCH[k]}`} /></span>
            {t.actions[k]}
          </li>
        ))}
      </ul>
      {modes && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t.mode}>
            <span className="label mr-1">{t.mode}</span>
            {MODES.map((m) => <Button key={m} size="sm" variant={m === mode ? "secondary" : "ghost"} aria-pressed={m === mode} onClick={() => setMode(m)} data-testid={`city-mode-${m}`}>{t.modes[m]}</Button>)}
          </div>
          <label className="label flex min-h-6 items-center gap-2">
            <input type="checkbox" className="size-4 accent-[var(--signal)]" checked={duty} onChange={(e) => setDuty(e.target.checked)} />
            {t.duty}
          </label>
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex items-center gap-1.5" role="group" aria-label={t.speed}>
          <Button size="sm" variant="outline" onClick={() => setPlaying(!running)}>
            {running ? <Pause aria-hidden /> : <Play aria-hidden />}
            {running ? t.pause : t.play}
          </Button>
          {RATES.map((r) => <Button key={r} size="sm" variant={r === rate ? "secondary" : "ghost"} aria-pressed={r === rate} onClick={() => setRate(r)}>{r}×</Button>)}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Readout label={t.clock} value={shown.clock} tone="plain" />
          <Readout label={t.sync} value={Math.round(shown.sync * 100)} unit="%" />
          <Readout label={t.frame} value={shown.frame.toFixed(1)} unit={t.frameUnit} />
          <Readout label={t.calls} value={shown.calls} tone="muted" />
        </div>
      </div>
    </div>
  );
}
