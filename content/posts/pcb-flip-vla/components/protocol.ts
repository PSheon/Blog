import type { ExpertState, WorldEvent } from "./sim";

export type Driver = "expert" | "model";
export type Disturbance = "shove" | "nudge" | "turn";

/** Page → worker. */
export type Request =
  | { type: "run"; on: boolean }
  | { type: "next" }
  | { type: "driver"; driver: Driver; checkpoint: string }
  | { type: "slip"; slip: number }
  | { type: "tilt"; on: boolean }
  | { type: "disturb"; what: Disturbance };

/** Worker → page: one of these per step, with both pictures. */
export type Reply =
  | { type: "loading"; checkpoint: string }
  | { type: "error"; message: string }
  | { type: "frame"; big: Uint8Array; eye: Uint8Array; words: number[]; expertState: ExpertState; step: number; outcome: "running" | "success" | "failed"; event: WorldEvent | null; driver: Driver; inferenceMs: number };

export const BIG = 384;
