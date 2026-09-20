"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/components/lab/use-reduced-motion";
import type { PeopleColors } from "./city-view3d";
import { CitySession, type PanelState, type Setup } from "./session";
import { useVisible } from "./use-visible";

/** One colour per activity, shared by the people in the scene and every legend: the data-series tokens, in their dark values. */
export const SWATCH = { work: "bg-chart-1", eat: "bg-chart-2", social: "bg-chart-5", sleep: "bg-chart-4", idle: "bg-foreground" } as const;
/** The same, for SVG. Spelled out: Tailwind only ships the class names it can read in the source. */
export const FILL = { work: "fill-chart-1", eat: "fill-chart-2", social: "fill-chart-5", sleep: "fill-chart-4", idle: "fill-foreground", walking: "fill-muted-foreground" } as const;
const TOKEN: Record<keyof typeof SWATCH, string> = { work: "--chart-1", eat: "--chart-2", social: "--chart-5", sleep: "--chart-4", idle: "--foreground" };

/**
 * Runs a city behind a canvas. three.js is fetched the first time the figure is on screen (the canvas holds its place
 * until then); the loop only works while the figure is on screen and the tab is visible; the caller gets a fresh
 * `PanelState` a few times a second, which is all React ever re-renders for.
 */
export function useCity(root: RefObject<HTMLElement | null>, canvas: RefObject<HTMLCanvasElement | null>, initial: Setup, eventCount = 8) {
  const reduced = useReducedMotion(), visible = useVisible(root), session = useRef<CitySession | null>(null);
  const [ready, setReady] = useState(false), [panel, setPanel] = useState<PanelState | null>(null);

  useEffect(() => { if (session.current) session.current.reduced = reduced; }, [reduced]);

  useEffect(() => {
    // A phone gets a third of the crowd: the picture is a third of the size.
    const s = new CitySession({ ...initial, agents: window.innerWidth < 640 ? Math.min(initial.agents, 100) : initial.agents });
    // Under reduced motion the clock starts paused and the camera never circles.
    s.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; s.running = !s.reduced;
    session.current = s;
    let cancelled = false, loading = false, raf = 0, last = 0, polled = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible.current || document.hidden) { last = 0; return; }
      if (!s.view) {
        if (loading || !canvas.current) return;
        loading = true;
        void Promise.all([import("three"), import("./city-view3d")]).then(([T, { CityView }]) => {
          if (cancelled || !canvas.current) return;
          const style = getComputedStyle(canvas.current), colors = Object.fromEntries(Object.entries(TOKEN).map(([k, v]) => [k, style.getPropertyValue(v).trim()])) as PeopleColors;
          s.view = new CityView(T, canvas.current, s.city);
          s.view.setPeople(s.frame.count, colors);
          // More or fewer people only need new instances; a new city needs a new scene.
          s.onRebuild = () => {
            if (!s.view || !canvas.current) return;
            if (s.view.city !== s.city) { s.view.dispose(); s.view = new CityView(T, canvas.current, s.city); }
            s.view.follow = -1;
            s.view.setPeople(s.frame.count, colors);
          };
          setReady(true);
        });
        return;
      }
      s.step(now, last ? Math.min(0.1, (now - last) / 1000) : 0);
      last = now;
      if (now - polled >= 220) { polled = now; setPanel(s.panel(eventCount)); }
    };
    const onResize = () => s.touch();
    window.addEventListener("resize", onResize);
    raf = requestAnimationFrame(loop);
    return () => { cancelled = true; cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); s.dispose(); session.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one session per mount; later changes go through the session
  }, []);

  return { session, ready, panel };
}
