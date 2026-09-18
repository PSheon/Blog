import { type Tensor, dense, elu, tensor } from "@/lib/ml";

/**
 * The walking policy published in DeepRoboticsLab/Lite3_rl_deploy (BSD-3): a plain MLP that maps
 * 45 numbers the robot can feel to 12 joint targets. Everything here mirrors the constants in that
 * repo's run_policy/lite3_test_policy_runner_onnx.hpp.
 */
export const OBS = 45, JOINTS = 12;
const SIZES = [OBS, 512, 256, 128, JOINTS];

/** Standing pose the actions are offsets from, per leg: hip roll, hip pitch, knee (rad). */
export const DEFAULT_POSE = [0, -0.65, 1.3, 0, -0.65, 1.3, 0, -0.65, 1.3, 0, -0.65, 1.3];
export const ACTION_SCALE = [0.125, 0.25, 0.25, 0.125, 0.25, 0.25, 0.125, 0.25, 0.25, 0.125, 0.25, 0.25];
/** Physics runs at 1 kHz; the policy is asked every 12th step. */
export const DECIMATION = 12;
export const KP = 30, KD = 1, TORQUE_LIMIT = 30;

/** Where each sense sits in the observation vector. */
export const SENSES = {
  gyro: [0, 3],
  gravity: [3, 6],
  command: [6, 9],
  jointPos: [9, 21],
  jointVel: [21, 33],
  lastAction: [33, 45],
} as const;
export type Sense = keyof typeof SENSES;

export class Policy {
  private readonly layers: { w: Tensor; b: Tensor }[] = [];

  /** `weights` is every layer's weight matrix then bias, little-endian float32, in order. */
  constructor(weights: ArrayBuffer) {
    const all = new Float32Array(weights);
    const expected = SIZES.slice(1).reduce((n, rows, i) => n + rows * SIZES[i] + rows, 0);
    if (all.length !== expected) throw new Error(`policy: expected ${expected} weights, got ${all.length}`);
    let at = 0;
    for (let i = 0; i + 1 < SIZES.length; i++) {
      const rows = SIZES[i + 1], cols = SIZES[i];
      const w = tensor(all.subarray(at, (at += rows * cols)), [rows, cols]);
      const b = tensor(all.subarray(at, (at += rows)), [rows]);
      this.layers.push({ w, b });
    }
  }

  act(obs: Float32Array): Float32Array {
    let x = tensor(obs, [1, OBS]);
    this.layers.forEach(({ w, b }, i) => {
      x = dense(x, w, b);
      if (i + 1 < this.layers.length) x = elu(x);
    });
    return x.data;
  }
}

/** Which way is down, seen from the body: Rᵀ·(0, 0, −1) for the unit quaternion (w, x, y, z). */
export function gravityInBody(w: number, x: number, y: number, z: number): [number, number, number] {
  return [-2 * (x * z - w * y), -2 * (y * z + w * x), -(1 - 2 * (x * x + y * y))];
}

/** Assemble what the policy feels from MuJoCo's state (free joint first: 7 qpos, 6 qvel). */
export function observe(qpos: ArrayLike<number>, qvel: ArrayLike<number>, command: ArrayLike<number>, lastAction: ArrayLike<number>): Float32Array {
  const obs = new Float32Array(OBS), g = gravityInBody(qpos[3], qpos[4], qpos[5], qpos[6]);
  for (let i = 0; i < 3; i++) {
    obs[i] = qvel[3 + i] * 0.25;
    obs[3 + i] = g[i];
    obs[6 + i] = command[i];
  }
  for (let i = 0; i < JOINTS; i++) {
    obs[9 + i] = qpos[7 + i] - DEFAULT_POSE[i];
    obs[21 + i] = qvel[6 + i] * 0.05;
    obs[33 + i] = lastAction[i];
  }
  return obs;
}
