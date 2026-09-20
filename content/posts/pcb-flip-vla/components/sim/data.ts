import { mulberry32 } from "@/lib/ml";
import { expert } from "./expert";
import { encode } from "./language";
import { type CameraShift, NO_SHIFT, render } from "./raster";
import { type Action, deltaOf } from "./tokens";
import { PARAMS } from "./params";
import { World } from "./world";

export type Mode = "bc" | "dart";
/** One episode as the model will meet it: what the camera saw before each step, and the action the expert would take there. */
export type Trajectory = { seed: number; instruction: number[]; frames: Uint8Array[]; proprio: number[][]; labels: Action[]; taken: Action[]; success: boolean };

/** What the arm feels of itself: sine and cosine of each joint, and whether the gripper is shut. Nine numbers. */
export const proprioOf = (world: World): number[] => [...world.q.flatMap((v) => [Math.sin(v), Math.cos(v)]), world.closed ? 1 : 0];
export type Collect = { mode: Mode; slip?: number; noise?: number; camera?: (seed: number) => CameraShift };

/**
 * A dataset is a list of seeds and a way of collecting: nothing is stored that cannot be grown again.
 * - bc: the expert acts, the expert's action is the label. Only states a perfect run visits.
 * - dart: the expert's action plus noise is what happens; the clean action is still the label ("you have drifted; here is how to get back").
 */
export function collect(seed: number, options: Collect): Trajectory {
  const world = new World(seed), noise = mulberry32(seed ^ 0x51f15e), shift = options.camera?.(seed) ?? NO_SHIFT;
  world.slipRate = options.slip ?? PARAMS.slip;
  const frames: Uint8Array[] = [], proprio: number[][] = [], labels: Action[] = [], taken: Action[] = [];
  while (!world.success && !world.failed) {
    frames.push(render(world, shift)); proprio.push(proprioOf(world));
    const label = expert(world).action, act = [...label] as Action;
    if (options.mode === "dart" && options.noise) for (let j = 0; j < 4; j++) {
      // Noise in radians on what the expert wanted, re-binned; the gripper is never jittered.
      const gaussian = Math.sqrt(-2 * Math.log(1 - noise())) * Math.cos(2 * Math.PI * noise());
      act[j] = Math.round(Math.min(PARAMS.bins - 1, Math.max(0, label[j] + (gaussian * options.noise * (PARAMS.bins - 1)) / 2)));
    }
    labels.push(label); taken.push(act);
    world.step(act);
  }
  return { seed, instruction: encode(world.task), frames, proprio, labels, taken, success: world.success };
}

/** Radians a bin index stands for, for every joint: handy when a script wants the numbers and not the tokens. */
export const actionDeltas = (a: Action): number[] => [0, 1, 2, 3].map((j) => deltaOf(j, a[j]));
