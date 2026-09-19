"use client";

import { useSyncExternalStore } from "react";
import type { Reply, Request } from "./protocol";
import type { ShapeName } from "./shapes";

/**
 * One model for the whole article, living in a Web Worker: the reader picks two fruit and trains it in the first
 * instrument, and the instruments further down ask that same model questions.
 */
export interface LabState {
  pair: [ShapeName, ShapeName];
  running: boolean;
  steps: number;
  loss: number;
  perSec: number;
  /** Bumped whenever the model is thrown away, so views know to start over. */
  generation: number;
}

let state: LabState = { pair: ["apple", "banana"], running: false, steps: 0, loss: 0, perSec: 0, generation: 0 };
let worker: Worker | null = null, nextId = 1;
const listeners = new Set<() => void>(), frameListeners = new Set<(cloud: Float32Array) => void>();
const pending = new Map<number, (reply: Reply) => void>();

function set(patch: Partial<LabState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function send(request: Request, transfer: Transferable[] = []) {
  if (!worker) {
    worker = new Worker(new URL("./model.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<Reply>) => {
      if (data.type === "stats") set({ steps: data.steps, loss: data.loss, perSec: data.perSec, generation: data.generation });
      else if (data.type === "frame") frameListeners.forEach((l) => l(data.cloud));
      else { pending.get(data.id)?.(data); pending.delete(data.id); }
    };
    worker.onerror = (e) => console.error("[diffusion] worker failed", e.message);
    worker.postMessage({ type: "pair", pair: state.pair } satisfies Request);
  }
  worker.postMessage(request, transfer);
}

type Asked<T extends Reply["type"]> = Extract<Reply, { type: T }>;
/** Ask the worker something and wait for its answer. */
function ask<T extends "trajectory" | "guided" | "field">(build: (id: number) => Extract<Request, { type: T }>, transfer: Transferable[] = []): Promise<Asked<T>> {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, (reply) => resolve(reply as Asked<T>));
    send(build(id), transfer);
  });
}

export const setRunning = (running: boolean) => { set({ running }); send({ type: "run", running }); };
/** Choose the two fruit. A different pair needs a fresh model: the old one knows nothing about the new fruit. */
export const setPair = (pair: [ShapeName, ShapeName]) => { set({ pair, running: false, steps: 0, loss: 0, perSec: 0 }); send({ type: "pair", pair }); };
export const resetModel = () => { set({ running: false, steps: 0, loss: 0, perSec: 0 }); send({ type: "reset" }); };
export const setLive = (on: boolean, loop: boolean) => send({ type: "live", on, loop });
export const setBlend = (blend: number) => send({ type: "blend", blend });
export const sampleAgain = () => send({ type: "again" });
export const trajectory = (perCloud: number, steps: number) => ask<"trajectory">((id) => ({ type: "trajectory", id, perCloud, steps }));
export const guided = (perCloud: number, steps: number, guidance: number, start: Float32Array) => ask<"guided">((id) => ({ type: "guided", id, perCloud, steps, guidance, start }));
export const field = (level: number, points: Float32Array) => ask<"field">((id) => ({ type: "field", id, level, points }));

/** Frames of the first instrument's clouds, as the worker produces them. */
export function onFrame(listener: (cloud: Float32Array) => void) {
  frameListeners.add(listener);
  return () => void frameListeners.delete(listener);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;

export function useLab(): LabState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
