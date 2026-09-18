"use client";

import { useSyncExternalStore } from "react";
import { type Activation, MNIST_CNN, Sequential, type Weights, tensor } from "@/lib/ml";
import { preprocess } from "./preprocess";
import { RASTER_SIZE, SAMPLES, type Stroke, rasterize } from "./strokes";

/**
 * One drawing, shared by every instrument in the article: draw in one figure and the
 * feature maps and the occlusion map further down follow along.
 */
export interface LabState {
  status: "idle" | "loading" | "ready" | "error";
  strokes: Stroke[];
  /** The 28×28 image the network receives. */
  input: Float32Array;
  activations: Activation[] | null;
  probs: Float32Array | null;
  prediction: number | null;
  /** Wall-clock time of the last forward pass. */
  ms: number;
}

const START_DIGIT = 7;

let model: Sequential | null = null;
let state: LabState = {
  status: "idle",
  strokes: SAMPLES[START_DIGIT],
  input: preprocess(rasterize(SAMPLES[START_DIGIT]), RASTER_SIZE),
  activations: null,
  probs: null,
  prediction: null,
  ms: 0,
};
const listeners = new Set<() => void>();

function set(patch: Partial<LabState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function infer(input: Float32Array): Partial<LabState> {
  if (!model) return {};
  const empty = input.every((v) => v === 0);
  if (empty) return { activations: null, probs: null, prediction: null, ms: 0 };
  const t0 = performance.now();
  const activations = model.forward(tensor(input, [1, 1, 28, 28]));
  const ms = performance.now() - t0;
  const probs = activations[activations.length - 1].output.data;
  let prediction = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[prediction]) prediction = i;
  return { activations, probs, prediction, ms };
}

/** Weights are a separate chunk, fetched the first time any instrument mounts. */
export async function loadModel() {
  if (state.status === "loading" || state.status === "ready") return;
  set({ status: "loading" });
  try {
    const file = (await import("../weights.json")) as unknown as { default: { weights: Weights } };
    model = new Sequential(MNIST_CNN, file.default.weights);
    set({ status: "ready", ...infer(state.input) });
  } catch (error) {
    console.error("[cnn] failed to load weights", error);
    set({ status: "error" });
  }
}

export function setStrokes(strokes: Stroke[]) {
  const input = preprocess(rasterize(strokes), RASTER_SIZE);
  set({ strokes, input, ...infer(input) });
}

export function getModel(): Sequential | null {
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
