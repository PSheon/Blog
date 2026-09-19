"use client";

import { useSyncExternalStore } from "react";
import { PointDiffusion } from "./diffusion";
import { SHAPES, type ShapeName } from "./shapes";

/**
 * One model for the whole article: the reader picks two fruit and trains it in the first instrument, and the
 * instruments further down look inside that same model.
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

/** Milliseconds of training per animation frame; the rest of the frame belongs to sampling and drawing. */
const TRAIN_BUDGET_MS = 8;

let model = new PointDiffusion(2);
let state: LabState = { pair: ["apple", "banana"], running: false, steps: 0, loss: 0, perSec: 0, generation: 0 };
let frame = 0, trainMs = 0, sincePublish = 0;
const listeners = new Set<() => void>();

function set(patch: Partial<LabState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function loop() {
  frame = requestAnimationFrame(loop);
  if (document.hidden) return;
  const shapes = state.pair.map((name) => SHAPES[name]), t0 = performance.now();
  do model.train(shapes, 256, model.steps < 4000 ? 2e-3 : 5e-4);
  while (performance.now() - t0 < TRAIN_BUDGET_MS);
  trainMs += performance.now() - t0;
  if (++sincePublish >= 10) {
    sincePublish = 0;
    set({ steps: model.steps, loss: model.loss, perSec: (model.steps / trainMs) * 1000 });
  }
}

export function setRunning(running: boolean) {
  cancelAnimationFrame(frame);
  if (running) frame = requestAnimationFrame(loop);
  set({ running, steps: model.steps, loss: model.loss });
}

/** Choose the two fruit. A different pair needs a fresh model: the old one knows nothing about the new fruit. */
export function setPair(pair: [ShapeName, ShapeName]) {
  if (pair[0] === state.pair[0] && pair[1] === state.pair[1]) return;
  resetModel(pair);
}

export function resetModel(pair: [ShapeName, ShapeName] = state.pair) {
  cancelAnimationFrame(frame);
  model = new PointDiffusion(2);
  trainMs = 0;
  set({ pair, running: false, steps: 0, loss: 0, perSec: 0, generation: state.generation + 1 });
}

export function getModel(): PointDiffusion {
  return model;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;

export function useLab(): LabState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
