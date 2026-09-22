import { PARAMS } from "./params";

/** One step of output: a bin for each of yaw, shoulder, elbow and roll, then 0 = open / 1 = closed. */
export type Action = [yaw: number, shoulder: number, elbow: number, roll: number, grip: number];
export const ACTION_TOKENS = 5;
export const STILL = (PARAMS.bins - 1) / 2;

/** The change of joint `joint` that bin `bin` stands for. Bins are evenly spaced from −max to +max. */
export const deltaOf = (joint: number, bin: number): number => ((bin - STILL) / STILL) * PARAMS.maxDelta[joint];

/** The nearest bin to a wanted change, which is clipped to what one step allows. */
export function binOf(joint: number, delta: number): number {
  const max = PARAMS.maxDelta[joint];
  return Math.round((Math.min(max, Math.max(-max, delta)) / max) * STILL + STILL);
}
