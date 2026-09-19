import type { ShapeName } from "./shapes";

/** Points per cloud, and how the live view in the first instrument is sampled. */
export const LIVE = { perCloud: 1100, clouds: 3, steps: 40, holdMs: 1400, frameMs: 50 } as const;

/** Main thread → worker. Anything with an `id` is answered by a message carrying the same id. */
export type Request =
  | { type: "pair"; pair: [ShapeName, ShapeName] }
  | { type: "reset" }
  | { type: "run"; running: boolean }
  /** The first instrument's clouds: keep sampling them and posting frames while `on`. */
  | { type: "live"; on: boolean; loop: boolean }
  | { type: "blend"; blend: number }
  | { type: "again" }
  | { type: "trajectory"; id: number; perCloud: number; steps: number }
  | { type: "guided"; id: number; perCloud: number; steps: number; guidance: number; start: Float32Array }
  | { type: "field"; id: number; level: number; points: Float32Array };

/** Worker → main thread. */
export type Reply =
  | { type: "stats"; steps: number; loss: number; perSec: number; generation: number }
  | { type: "frame"; cloud: Float32Array; generation: number }
  | { type: "trajectory"; id: number; levels: number[]; points: Float32Array; guesses: Float32Array; trainedFor: number }
  | { type: "guided"; id: number; cloud: Float32Array; trainedFor: number }
  | { type: "field"; id: number; noise: Float32Array; trainedFor: number };
