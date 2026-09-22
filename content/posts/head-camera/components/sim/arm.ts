import { PARAMS } from "./params";

/** yaw, shoulder, elbow, wrist roll. The wrist's pitch is not a joint: it is slaved so the gripper stays level. */
export type Joints = [yaw: number, shoulder: number, elbow: number, roll: number];
export type Vec3 = [x: number, y: number, z: number];

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));

export function clampJoints(q: Joints): Joints {
  const l = PARAMS.limits;
  return [clamp(q[0], l.yaw), clamp(q[1], l.shoulder), clamp(q[2], l.elbow), clamp(q[3], l.roll)];
}

/** Radius and height of the point between the jaws, in the arm's vertical plane. */
export function reachOf(shoulder: number, elbow: number): { r: number; z: number } {
  const { upperArm: a, forearm: b, gripper: g, shoulderZ } = PARAMS;
  return { r: a * Math.cos(shoulder) + b * Math.cos(shoulder + elbow) + g, z: shoulderZ + a * Math.sin(shoulder) + b * Math.sin(shoulder + elbow) };
}

/** The point between the jaws. */
export function tipOf(q: Joints): Vec3 {
  const { r, z } = reachOf(q[1], q[2]);
  return [r * Math.cos(q[0]), r * Math.sin(q[0]), z];
}

/** Shoulder, elbow, wrist and tip, for drawing the arm. */
export function skeleton(q: Joints): Vec3[] {
  const { upperArm: a, forearm: b, gripper: g, shoulderZ } = PARAMS, c = Math.cos(q[0]), s = Math.sin(q[0]);
  const at = (r: number, z: number): Vec3 => [r * c, r * s, z];
  const er = a * Math.cos(q[1]), ez = shoulderZ + a * Math.sin(q[1]), wr = er + b * Math.cos(q[1] + q[2]), wz = ez + b * Math.sin(q[1] + q[2]);
  return [at(0, shoulderZ), at(er, ez), at(wr, wz), at(wr + g, wz)];
}

/**
 * Closed form. Yaw is the direction of the target; what is left is a two-link problem in the vertical plane, solved
 * elbow-up. Returns null when the point is out of reach or needs a joint past its limit.
 */
export function solveIK(target: Vec3, roll: number): Joints | null {
  const { upperArm: a, forearm: b, gripper: g, shoulderZ, limits } = PARAMS;
  const yaw = Math.atan2(target[1], target[0]), r = Math.hypot(target[0], target[1]) - g, z = target[2] - shoulderZ, d2 = r * r + z * z;
  const cosElbow = (d2 - a * a - b * b) / (2 * a * b);
  if (cosElbow < -1 || cosElbow > 1) return null;
  const elbow = -Math.acos(cosElbow), shoulder = Math.atan2(z, r) - Math.atan2(b * Math.sin(elbow), a + b * Math.cos(elbow));
  const inside = (v: number, [lo, hi]: readonly [number, number]) => v >= lo - 1e-9 && v <= hi + 1e-9;
  return inside(yaw, limits.yaw) && inside(shoulder, limits.shoulder) && inside(elbow, limits.elbow) && inside(roll, limits.roll) ? [yaw, shoulder, elbow, roll] : null;
}
