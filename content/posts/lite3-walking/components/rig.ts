"use client";

import { useSyncExternalStore } from "react";
import { KD, KP } from "./policy";
import { type Knobs, Lite3Sim } from "./sim";
import type { Lite3View } from "./view3d";

/**
 * One simulator, one WebGL canvas, shared by every instrument in the article. The download is
 * about 4.5 MB, so it happens once, on request; after that the robot lives in whichever
 * instrument is most in view, and its canvas is moved there.
 */
export interface RigState {
  status: "idle" | "loading" | "ready" | "error";
  /** The instrument the robot is in right now. */
  active: string | null;
  paused: boolean;
}

export const DEFAULT_KNOBS: Knobs = { command: [0.5, 0, 0], kp: KP, kd: KD, blind: null, latency: 0, noise: 0, friction: 1 };
/** Seconds it lies on the floor before being put back on its feet. */
const GET_UP_AFTER = 1.5;
/** An instrument takes the robot once this much of its stage is on screen. */
const CLAIM_RATIO = 0.35;

type Frame = (sim: Lite3Sim, dt: number) => void;
interface Panel {
  host: HTMLElement;
  knobs: Partial<Knobs>;
  visible: number;
  frame?: Frame;
}

let state: RigState = { status: "idle", active: null, paused: false };
let sim: Lite3Sim | null = null;
let view: Lite3View | null = null;
let canvas: HTMLCanvasElement | null = null;
let raf = 0;
let falls = 0;
const panels = new Map<string, Panel>();
const listeners = new Set<() => void>();

function set(patch: Partial<RigState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export async function loadRig() {
  if (state.status === "loading" || state.status === "ready") return;
  set({ status: "loading" });
  try {
    const [loaded, { Lite3View }] = await Promise.all([Lite3Sim.load(), import("./view3d")]);
    canvas = document.createElement("canvas");
    canvas.className = "block size-full";
    canvas.dataset.testid = "lite3-stage";
    canvas.setAttribute("aria-hidden", "true"); // the panels describe what is happening in text
    // The view reads the theme's colours from the canvas, so it has to be in the page first.
    const first = pick() ?? panels.keys().next().value ?? null;
    (first ? panels.get(first)!.host : document.body).append(canvas);
    view = await Lite3View.create(canvas);
    sim = loaded;
    new MutationObserver(() => view?.retheme()).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("visibilitychange", schedule);
    set({ status: "ready", paused: window.matchMedia("(prefers-reduced-motion: reduce)").matches });
    activate(first);
  } catch (error) {
    console.error("[lite3] failed to load", error);
    set({ status: "error" });
  }
}

/** The most visible stage, as long as it is visible enough; otherwise keep the current one. */
function pick(): string | null {
  let best: string | null = null, ratio = CLAIM_RATIO;
  panels.forEach((p, id) => {
    if (p.visible > ratio || (p.visible === ratio && id === state.active)) [best, ratio] = [id, p.visible];
  });
  return best ?? (state.active && (panels.get(state.active)?.visible ?? 0) > 0 ? state.active : null);
}

function activate(id: string | null) {
  if (id !== state.active) {
    const panel = id ? panels.get(id) : null;
    if (panel && canvas) panel.host.append(canvas);
    if (panel && sim) {
      Object.assign(sim.knobs, DEFAULT_KNOBS, panel.knobs);
      sim.reset();
      falls = 0;
    }
    set({ active: id });
  }
  schedule();
}

function schedule() {
  const run = state.status === "ready" && state.active !== null && !state.paused && !document.hidden;
  if (!run) {
    cancelAnimationFrame(raf);
    raf = 0;
    return;
  }
  if (raf) return;
  let prev = performance.now();
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const steps = Math.min(50, Math.round(now - prev)); // real time, but never spiral after a stall
    prev = now;
    step(steps);
  };
  raf = requestAnimationFrame(loop);
}

function step(ms: number) {
  if (!sim) return;
  sim.advance(ms);
  if (sim.fellAt !== null && sim.time - sim.fellAt > GET_UP_AFTER) {
    sim.reset(++falls + 1); // a new noise sequence each time, so it does not fall the same way again
  }
  view?.render(sim);
  panels.get(state.active ?? "")?.frame?.(sim, ms / 1000);
}

/** Called by a stage when it mounts; returns the clean-up. */
export function mountPanel(id: string, host: HTMLElement, knobs: Partial<Knobs>): () => void {
  const panel: Panel = { host, knobs, visible: 0 };
  panels.set(id, panel);
  const seen = new IntersectionObserver(([entry]) => {
    panel.visible = entry.intersectionRatio;
    if (state.status === "ready") activate(pick());
  }, { threshold: [0, CLAIM_RATIO, 0.6, 0.9] });
  seen.observe(host);
  return () => {
    seen.disconnect();
    panels.delete(id);
    if (state.active === id) {
      canvas?.remove();
      set({ active: null });
      activate(pick());
    }
  };
}

export function setPanelKnobs(id: string, knobs: Partial<Knobs>) {
  const panel = panels.get(id);
  if (!panel) return;
  panel.knobs = knobs;
  if (state.active === id && sim) Object.assign(sim.knobs, DEFAULT_KNOBS, knobs);
}

/** `frame` runs after every rendered frame while this panel has the robot. */
export function setPanelFrame(id: string, frame: Frame | undefined) {
  const panel = panels.get(id);
  if (panel) panel.frame = frame;
}

export function setPaused(paused: boolean) {
  set({ paused });
  schedule();
}

/** Put it back on its feet at the origin. */
export function resetRobot() {
  sim?.reset(++falls + 1);
  if (sim && state.paused) view?.render(sim);
}

export function pushRobot(newtons: number) {
  sim?.push(newtons);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;

export function useRig(): RigState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
