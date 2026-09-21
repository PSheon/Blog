import type { Mat34 } from "./models";

/**
 * The playground's character: Sketchbook's boxman (Jan Blaha / swift502, MIT), packed by scripts/light/pack-boxman.mjs.
 * 186 triangles on 14 joints. Every frame the pose is read from a clip, the joints' matrices are chained from the root
 * down, and each vertex is moved by the (up to four) joints it hangs on: linear blend skinning, on the CPU, because the
 * result has to go into this frame's BVH anyway.
 */
export const BOXMAN_URL = "/posts/light-playground/boxman.bin";
/** All 34 of Sketchbook's clips. */
export type ClipName = "idle" | "run" | "sprint" | "stop" | "start_forward" | "start_left" | "start_right" | "start_back_left" | "start_back_right" | "rotate_left" | "rotate_right" | "jump_idle" | "jump_running" | "falling" | "drop_idle" | "drop_running" | "drop_running_roll"
  | "open_door_standing_left" | "open_door_standing_right" | "close_door_standing_left" | "close_door_standing_right" | "close_door_sitting_left" | "close_door_sitting_right" | "sit_down_left" | "sit_down_right" | "stand_up_left" | "stand_up_right"
  | "enter_airplane_left" | "enter_airplane_right" | "sitting" | "sitting_shift_left" | "sitting_shift_right" | "driving" | "reset";

export interface Boxman {
  vertices: number; triangles: number; fps: number;
  joints: { name: string; parent: number; rest: number[] }[];
  above: number[];
  clips: Record<ClipName, { first: number; frames: number; duration: number }>;
  positions: Float32Array; weights: Float32Array; inverseBind: Float32Array; poses: Float32Array; bones: Uint8Array; indices: Uint16Array;
}

export function parseBoxman(file: ArrayBuffer): Boxman {
  const jsonBytes = new DataView(file).getUint32(0, true), h = JSON.parse(new TextDecoder().decode(new Uint8Array(file, 4, jsonBytes))) as Pick<Boxman, "vertices" | "triangles" | "fps" | "joints" | "above" | "clips">;
  let at = 4 + jsonBytes;
  const floats = (n: number) => { const a = new Float32Array(file, at, n); at += n * 4; return a; };
  const positions = floats(h.vertices * 3), weights = floats(h.vertices * 4), inverseBind = floats(h.joints.length * 16), frames = Object.values(h.clips).reduce((n, c) => Math.max(n, c.first + c.frames), 0), poses = floats(frames * h.joints.length * 10);
  const bones = new Uint8Array(file, at, h.vertices * 4); at += Math.ceil((h.vertices * 4) / 4) * 4;
  return { ...h, positions, weights, inverseBind, poses, bones, indices: new Uint16Array(file, at, h.triangles * 3) };
}

const mul4 = (a: ArrayLike<number>, ao: number, b: ArrayLike<number>, bo: number, out: Float32Array, oo: number) => {
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out[oo + c * 4 + r] = a[ao + r] * b[bo + c * 4] + a[ao + 4 + r] * b[bo + c * 4 + 1] + a[ao + 8 + r] * b[bo + c * 4 + 2] + a[ao + 12 + r] * b[bo + c * 4 + 3];
};

/** Scratch space for one character: allocate once, skin every frame. */
export function createSkinner(man: Boxman) {
  const J = man.joints.length, local = new Float32Array(16), world = new Float32Array(J * 16), skin = new Float32Array(J * 16), pose = new Float32Array(J * 10), skinned = new Float32Array(man.vertices * 3);
  return {
    /**
     * The pose of `clip` at `time` seconds (looping, or held on the last frame), blended `blend` (0…1) of the way from
     * the pose this skinner showed last: a change of clip does not snap.
     */
    pose(clip: ClipName, time: number, loop: boolean, blend = 1): void {
      const c = man.clips[clip], f = (loop ? ((time % c.duration) + c.duration) % c.duration : Math.min(time, c.duration * 0.999)) / c.duration * c.frames, f0 = Math.floor(f) % c.frames, f1 = loop ? (f0 + 1) % c.frames : Math.min(f0 + 1, c.frames - 1), u = f - Math.floor(f);
      for (let j = 0; j < J; j++) {
        const a = (c.first + f0) * J * 10 + j * 10, b = (c.first + f1) * J * 10 + j * 10, o = j * 10, P = man.poses;
        let dot = 0; for (let k = 3; k < 7; k++) dot += P[a + k] * P[b + k];
        const sign = dot < 0 ? -1 : 1;
        for (let k = 0; k < 10; k++) { const target = P[a + k] + ((k >= 3 && k < 7 ? sign : 1) * P[b + k] - P[a + k]) * u; pose[o + k] = blend >= 1 ? target : pose[o + k] + (target - pose[o + k]) * blend; }
        const l = Math.hypot(pose[o + 3], pose[o + 4], pose[o + 5], pose[o + 6]) || 1; for (let k = 3; k < 7; k++) pose[o + k] /= l; // normalised lerp: fine between neighbouring frames
      }
    },
    /** The bind pose: what the mesh looks like with no animation at all. */
    rest(): void { man.joints.forEach((j, i) => pose.set(j.rest, i * 10)); },
    /** Writes the character's triangles, placed by `place`, into `out` from triangle `cursor` on; returns the new cursor. */
    write(place: Mat34, material: number, out: { positions: Float32Array; materials: Uint32Array }, cursor: number): number {
      for (let j = 0; j < J; j++) {
        const o = j * 10, x = pose[o + 3], y = pose[o + 4], z = pose[o + 5], w = pose[o + 6], sx = pose[o + 7], sy = pose[o + 8], sz = pose[o + 9];
        local[0] = (1 - 2 * (y * y + z * z)) * sx; local[1] = 2 * (x * y + z * w) * sx; local[2] = 2 * (x * z - y * w) * sx; local[3] = 0;
        local[4] = 2 * (x * y - z * w) * sy; local[5] = (1 - 2 * (x * x + z * z)) * sy; local[6] = 2 * (y * z + x * w) * sy; local[7] = 0;
        local[8] = 2 * (x * z + y * w) * sz; local[9] = 2 * (y * z - x * w) * sz; local[10] = (1 - 2 * (x * x + y * y)) * sz; local[11] = 0;
        local[12] = pose[o]; local[13] = pose[o + 1]; local[14] = pose[o + 2]; local[15] = 1;
        const parent = man.joints[j].parent;
        if (parent < 0) mul4(man.above, 0, local, 0, world, j * 16); else mul4(world, parent * 16, local, 0, world, j * 16);
        mul4(world, j * 16, man.inverseBind, j * 16, skin, j * 16);
      }
      const P = man.positions, W = man.weights, B = man.bones, m = place;
      for (let v = 0; v < man.vertices; v++) {
        const px = P[v * 3], py = P[v * 3 + 1], pz = P[v * 3 + 2];
        let x = 0, y = 0, z = 0;
        for (let k = 0; k < 4; k++) { const weight = W[v * 4 + k]; if (weight === 0) continue; const s = B[v * 4 + k] * 16; x += weight * (skin[s] * px + skin[s + 4] * py + skin[s + 8] * pz + skin[s + 12]); y += weight * (skin[s + 1] * px + skin[s + 5] * py + skin[s + 9] * pz + skin[s + 13]); z += weight * (skin[s + 2] * px + skin[s + 6] * py + skin[s + 10] * pz + skin[s + 14]); }
        skinned[v * 3] = m[0] * x + m[3] * y + m[6] * z + m[9]; skinned[v * 3 + 1] = m[1] * x + m[4] * y + m[7] * z + m[10]; skinned[v * 3 + 2] = m[2] * x + m[5] * y + m[8] * z + m[11];
      }
      for (let t = 0; t < man.triangles; t++, cursor++) { for (let k = 0; k < 3; k++) { const v = man.indices[t * 3 + k] * 3; out.positions[cursor * 9 + k * 3] = skinned[v]; out.positions[cursor * 9 + k * 3 + 1] = skinned[v + 1]; out.positions[cursor * 9 + k * 3 + 2] = skinned[v + 2]; } out.materials[cursor] = material; }
      return cursor;
    },
  };
}
