"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { useReducedMotion } from "@/components/lab/use-reduced-motion";
import { Button } from "@/components/ui/button";
import type { CityView } from "./city-view3d";
import { useLabels } from "./labels";
import { formatTime, generateCity, PARAMS } from "./sim";
import { useVisible } from "./use-visible";

const RATES = [1, 5, 20];

/** Fig. 01: the city and its day. three.js is fetched the first time the figure is on screen; the canvas holds its place until then. */
export function CityLab({ seed = 1, n = 8 }: { seed?: number; n?: number }) {
  const t = useLabels(), reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), visible = useVisible(root);
  const [playing, setPlaying] = useState<boolean | null>(null), [rate, setRate] = useState(1), [ready, setReady] = useState(false);
  const [shown, setShown] = useState({ clock: formatTime(PARAMS.startMinute), frame: 0, calls: 0 });
  // Under reduced motion the clock starts paused and the camera never circles.
  const running = playing ?? !reduced, live = useRef({ running, rate, reduced });
  useEffect(() => { live.current = { running, rate, reduced }; });

  useEffect(() => {
    let cancelled = false, loading = false, raf = 0, view: CityView | null = null, last = 0, simTime: number = PARAMS.startMinute, dirty = true;
    let spent = 0, frames = 0, since = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible.current || document.hidden) { last = 0; return; }
      if (!view) {
        if (loading || !canvas.current) return;
        loading = true;
        void Promise.all([import("three"), import("./city-view3d")]).then(([T, { CityView }]) => {
          if (cancelled || !canvas.current) return;
          view = new CityView(T, canvas.current, generateCity(seed, n));
          setReady(true);
        });
        return;
      }
      const started = performance.now(), dt = last ? Math.min(0.1, (now - last) / 1000) : 0, { running, rate, reduced } = live.current;
      last = now;
      if (running) { simTime += dt * PARAMS.minutesPerSecond * rate; dirty = true; }
      const orbiting = running && !reduced;
      if (dirty || orbiting) { view.setTime(simTime); view.render(dt, orbiting); dirty = false; }
      spent += performance.now() - started; frames++;
      if (now - since >= 1000) { setShown({ clock: formatTime(simTime), frame: spent / frames, calls: view.calls }); spent = 0; frames = 0; since = now; }
    };
    const onResize = () => { dirty = true; };
    window.addEventListener("resize", onResize);
    raf = requestAnimationFrame(loop);
    return () => { cancelled = true; cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); view?.dispose(); };
  }, [seed, n, visible]);

  return (
    <div ref={root} className="grid gap-3 text-sm">
      <div className="relative">
        <canvas ref={canvas} role="img" aria-label={t.scene} className="aspect-[4/5] w-full rounded-sm bg-[#070918] sm:aspect-[16/9]" data-testid="city-canvas" />
        {!ready && <p className="label absolute inset-0 grid place-items-center text-[#9b9bc4]">{t.loading}</p>}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex items-center gap-1.5" role="group" aria-label={t.speed}>
          <Button size="sm" variant="outline" onClick={() => setPlaying(!running)}>
            {running ? <Pause aria-hidden /> : <Play aria-hidden />}
            {running ? t.pause : t.play}
          </Button>
          {RATES.map((r) => (
            <Button key={r} size="sm" variant={r === rate ? "secondary" : "ghost"} aria-pressed={r === rate} onClick={() => setRate(r)}>{r}×</Button>
          ))}
        </div>
        <div className="flex gap-6">
          <Readout label={t.clock} value={shown.clock} tone="plain" />
          <Readout label={t.frame} value={shown.frame.toFixed(1)} unit={t.frameUnit} />
          <Readout label={t.calls} value={shown.calls} tone="muted" />
        </div>
      </div>
    </div>
  );
}
