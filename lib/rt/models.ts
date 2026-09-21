import type { Material, Vec3 } from "./scene";

/**
 * The playground's vehicles: Sketchbook's car, helicopter and aeroplane (Jan Blaha / swift502, MIT), packed by
 * scripts/light/pack-models.mjs as geometry and a kind per triangle (paint, window, tyre, interior). A model is a body and the
 * parts that move by themselves (wheels, rotors), each about its own origin with a rest transform onto the body.
 */
export const MODELS_URL = "/posts/light-playground/models.bin";
export type ModelName = "car" | "heli" | "airplane";
/** Column-major 3 × 4: three basis vectors, then the translation. */
export type Mat34 = number[];

/** Where someone sits, which door is theirs, and where they stand to get in (all in the model's frame; all facing +z, as the models do). */
export interface Seat { name: string; type: string; at: Vec3; door: string | null; /** seats one can slide over to from here */ connected: string[]; entries: { name: string; at: Vec3 }[] }
export interface Part { name: string; role: "body" | "wheel" | "rotor" | "door"; steering?: boolean; drive?: string | null; rest: Mat34 | null; first: number; count: number }
export interface Model { parts: Part[]; colliders: ({ shape: "sphere"; at: Vec3; radius: number } | { shape: "box"; at: Vec3; half: Vec3; rest: number[] })[]; seats: Seat[]; anchors: { camera?: Vec3 } }
export interface Models { models: Record<ModelName, Model>; positions: Float32Array; kinds: Uint8Array }

export function parseModels(file: ArrayBuffer): Models {
  const jsonBytes = new DataView(file).getUint32(0, true), header = JSON.parse(new TextDecoder().decode(new Uint8Array(file, 4, jsonBytes))) as { triangles: number; models: Models["models"] };
  const at = 4 + jsonBytes;
  return { models: header.models, positions: new Float32Array(file, at, header.triangles * 9), kinds: new Uint8Array(file, at + header.triangles * 36, header.triangles) };
}

/** Paint, window and tyre for each vehicle. Paint is a rough metal, so the sky and the ground show in it. */
export const VEHICLE_MATERIALS: Record<ModelName, [Material, Material, Material, Material]> = (() => {
  const window: Material = { albedo: [0.55, 0.62, 0.68], emit: [0, 0, 0], metallic: true, roughness: 0.08 }, tyre: Material = { albedo: [0.03, 0.03, 0.035], emit: [0, 0, 0] }, cabin: Material = { albedo: [0.13, 0.12, 0.12], emit: [0, 0, 0] }; // seats, floor, dashboard: dark cloth, so the paint is the car's colour and not everything in it
  const paint = (r: number, g: number, b: number): Material => ({ albedo: [r, g, b], emit: [0, 0, 0], metallic: true, roughness: 0.38 });
  return { car: [paint(0.78, 0.07, 0.06), window, tyre, cabin], heli: [paint(0.93, 0.66, 0.08), window, tyre, cabin], airplane: [paint(0.86, 0.87, 0.9), window, tyre, cabin] };
})();

/** More paints for the car park, so that five cars are not five red cars. */
export const CAR_PAINTS: Material[] = [[0.08, 0.32, 0.72], [0.95, 0.72, 0.1], [0.9, 0.9, 0.92], [0.1, 0.5, 0.3]].map(([r, g, b]) => ({ albedo: [r, g, b], emit: [0, 0, 0], metallic: true, roughness: 0.38 }));

export const IDENTITY: Mat34 = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
/** a · b: first b, then a. */
export function compose(a: Mat34, b: Mat34): Mat34 {
  const o = new Array<number>(12);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 3; r++) o[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2] + (c === 3 ? a[9 + r] : 0);
  return o;
}
export function rotationX(angle: number): Mat34 { const c = Math.cos(angle), s = Math.sin(angle); return [1, 0, 0, 0, c, s, 0, -s, c, 0, 0, 0]; }
export function rotationY(angle: number): Mat34 { const c = Math.cos(angle), s = Math.sin(angle); return [c, 0, -s, 0, 1, 0, s, 0, c, 0, 0, 0]; }
/** Position and unit quaternion (x, y, z, w), as a physics engine hands them over. */
export function fromPose(p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number; w: number }): Mat34 {
  const { x, y, z, w } = q;
  return [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), p.x, p.y, p.z];
}

/**
 * Writes one model's triangles, in world space, into `out` from triangle `cursor` on. `pose` places the body; `moving`
 * gives a part of its own a transform in the part's own frame (a wheel's spin, a rotor's turn), applied before its
 * rest transform. Returns the new cursor.
 */
export function writeModel(all: Models, name: ModelName, /** where paint, window, tyre and interior are in the scene's materials: a start index, or the four */ materialBase: number | [number, number, number, number], pose: Mat34, moving: (part: Part, index: number) => Mat34 | null, out: { positions: Float32Array; materials: Uint32Array }, cursor: number): number {
  const P = all.positions;
  all.models[name].parts.forEach((part, index) => {
    let m = pose;
    if (part.rest) { const own = moving(part, index); m = compose(pose, own ? compose(part.rest, own) : part.rest); }
    for (let t = part.first; t < part.first + part.count; t++, cursor++) {
      for (let v = 0; v < 3; v++) { const x = P[t * 9 + v * 3], y = P[t * 9 + v * 3 + 1], z = P[t * 9 + v * 3 + 2], o = cursor * 9 + v * 3; out.positions[o] = m[0] * x + m[3] * y + m[6] * z + m[9]; out.positions[o + 1] = m[1] * x + m[4] * y + m[7] * z + m[10]; out.positions[o + 2] = m[2] * x + m[5] * y + m[8] * z + m[11]; }
      out.materials[cursor] = typeof materialBase === "number" ? materialBase + all.kinds[t] : materialBase[all.kinds[t]];
    }
  });
  return cursor;
}
