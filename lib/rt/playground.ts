import { CAR_PAINTS, VEHICLE_MATERIALS, type ModelName } from "./models";
import type { Material, Scene, Vec3 } from "./scene";

/**
 * The playground of the series' last article: the geometry of Sketchbook's world (Jan Blaha / swift502, MIT), packed by
 * scripts/light/pack-playground.mjs. The file holds positions, indices and material names and nothing else; the original's
 * textures are photographs that may not be redistributed, and none of them is here. The colours are this palette.
 */
export const PLAYGROUND_URL = "/posts/light-playground/playground.bin";
export const PLAYGROUND_CREDIT = "Sketchbook by Jan Blaha (swift502), MIT";

const MAX_EDGE = 12, MAX_CUTS = 8;
/**
 * Linear albedo per material name. The names are the original's and mislead: `roof` is the great slab everything stands
 * on, `concrete` the plaza, `plaster` the paths, ramps and loops, `helipad` the pad and yellow trims, s1–s6 the props.
 * The idea: a sun-bleached concrete park by the sea. Large surfaces are pale and warm so that light has something to
 * bounce off and coloured things can tint them; colour is kept for what you steer around (barriers, props, pads).
 */
const PALETTE: Record<string, Vec3> = {
  roof: [0.5, 0.25, 0.17], concrete: [0.6, 0.58, 0.54], plaster: [0.8, 0.77, 0.7], wall_segmented: [0.48, 0.49, 0.52], wall_rough: [0.58, 0.45, 0.31],
  race_track: [0.07, 0.07, 0.08], runway: [0.09, 0.09, 0.1], dirt_road: [0.42, 0.31, 0.19], side_barrier: [0.84, 0.84, 0.84], barrier: [0.72, 0.1, 0.07],
  helipad: [0.72, 0.52, 0.1], arrow_down: [0.9, 0.85, 0.6],
  s1: [0.2, 0.42, 0.13], s2: [0.42, 0.6, 0.24], s3: [0.16, 0.36, 0.3], s4: [0.26, 0.47, 0.16], s5: [0.5, 0.62, 0.22], s6: [0.18, 0.4, 0.2],
  ocean: [0.01, 0.05, 0.08],
};

export interface Playground extends Scene { spawns: { type: string; at: Vec3; /** the spawn's three axes, column by column */ basis: number[] }[]; /** where each vehicle's three materials (paint, window, tyre) start in `materials` */ vehicleMaterials: Record<ModelName, number>; /** the character's material */ characterMaterial: number; /** where the extra car paints start */ carPaints: number }

export function parsePlayground(file: ArrayBuffer): Playground {
  const view = new DataView(file), jsonBytes = view.getUint32(0, true), header = JSON.parse(new TextDecoder().decode(new Uint8Array(file, 4, jsonBytes))) as { vertices: number; triangles: number; indexBytes: 2 | 4; materials: string[]; spawns: Playground["spawns"] };
  let at = 4 + jsonBytes;
  const vertices = new Float32Array(file, at, header.vertices * 3); at += header.vertices * 12;
  const indices = header.indexBytes === 4 ? new Uint32Array(file, at, header.triangles * 3) : new Uint16Array(file, at, header.triangles * 3); at += Math.ceil((header.triangles * 3 * header.indexBytes) / 4) * 4;
  const material = Array.from(new Uint8Array(file, at, header.triangles));
  // The ground is a few triangles a hundred metres long. A box around one of those contains half the playground, and a
  // ray along the ground then visits 60 nodes where 15 would do. So long triangles are cut across their longest edge
  // until no edge is longer than MAX_EDGE (or a triangle has been halved MAX_CUTS times): more triangles, tighter boxes.
  const positions: number[] = [], split: number[] = [];
  const cut = (a: Vec3, b: Vec3, c: Vec3, m: number, depth: number): void => {
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), bc = Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]), ca = Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]), longest = Math.max(ab, bc, ca);
    if (longest <= MAX_EDGE || depth >= MAX_CUTS) { positions.push(...a, ...b, ...c); split.push(m); return; }
    if (longest === ab) { const h: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; cut(a, h, c, m, depth + 1); cut(h, b, c, m, depth + 1); }
    else if (longest === bc) { const h: Vec3 = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2, (b[2] + c[2]) / 2]; cut(a, b, h, m, depth + 1); cut(a, h, c, m, depth + 1); }
    else { const h: Vec3 = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2, (c[2] + a[2]) / 2]; cut(a, b, h, m, depth + 1); cut(h, b, c, m, depth + 1); }
  };
  const corner = (i: number): Vec3 => { const v = indices[i] * 3; return [vertices[v], vertices[v + 1], vertices[v + 2]]; };
  for (let t = 0; t < header.triangles; t++) cut(corner(t * 3), corner(t * 3 + 1), corner(t * 3 + 2), material[t], 0);
  const materials: Material[] = header.materials.map((name) => ({ albedo: PALETTE[name] ?? [0.6, 0.6, 0.6], emit: [0, 0, 0], mirror: name === "ocean" }));
  const vehicleMaterials = {} as Record<ModelName, number>;
  for (const name of Object.keys(VEHICLE_MATERIALS) as ModelName[]) { vehicleMaterials[name] = materials.length; materials.push(...VEHICLE_MATERIALS[name]); }
  const characterMaterial = materials.push({ albedo: [0.92, 0.78, 0.3], emit: [0, 0, 0] }) - 1;
  const carPaints = materials.length; materials.push(...CAR_PAINTS);
  return { vehicleMaterials, characterMaterial, carPaints, positions, material: split, materials, camera: { eye: [60, 30, 70], target: [0, 14, -5], fov: 50 }, spawns: header.spawns };
}

/** Where the sun is at `hour` (0–24) and how strong: direction towards it, strength 0.05…1, and the sky's level. */
export function sunAt(hour: number): { sun: [number, number, number, number]; skyLevel: number } {
  const altitude = Math.sin(((hour - 6) / 24) * 2 * Math.PI), azimuth = ((hour - 6) / 12) * Math.PI;
  const d: Vec3 = [Math.cos(azimuth) * 0.8, Math.max(altitude, 0.05), Math.sin(azimuth) * 0.5 + 0.3], l = Math.hypot(...d);
  return { sun: [d[0] / l, d[1] / l, d[2] / l, Math.max(0.05, Math.min(1, altitude * 3))], skyLevel: Math.max(0.08, Math.min(1, altitude * 2 + 0.2)) };
}

/** The same file as a mesh for a physics engine: every vertex once, three indices a triangle. */
export function parsePlaygroundMesh(file: ArrayBuffer): { vertices: Float32Array; indices: Uint32Array; spawns: Playground["spawns"] } {
  const view = new DataView(file), jsonBytes = view.getUint32(0, true), header = JSON.parse(new TextDecoder().decode(new Uint8Array(file, 4, jsonBytes))) as { vertices: number; triangles: number; indexBytes: 2 | 4; spawns: Playground["spawns"] };
  const at = 4 + jsonBytes, vertices = new Float32Array(file.slice(at, at + header.vertices * 12)), start = at + header.vertices * 12;
  const indices = header.indexBytes === 4 ? new Uint32Array(file.slice(start, start + header.triangles * 12)) : Uint32Array.from(new Uint16Array(file.slice(start, start + header.triangles * 6)));
  return { vertices, indices, spawns: header.spawns };
}
