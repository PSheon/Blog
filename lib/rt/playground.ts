import { VEHICLE_MATERIALS, type ModelName } from "./models";
import type { Material, Scene, Vec3 } from "./scene";

/**
 * The playground of the series' last article: the geometry of Sketchbook's world (Jan Blaha / swift502, MIT), packed by
 * scripts/light/pack-playground.mjs. The file holds positions, indices and material names and nothing else; the original's
 * textures are photographs that may not be redistributed, and none of them is here. The colours are this palette.
 */
export const PLAYGROUND_URL = "/posts/light-playground/playground.bin";
export const PLAYGROUND_CREDIT = "Sketchbook by Jan Blaha (swift502), MIT";

const grass: Vec3 = [0.2, 0.4, 0.11];
/** Linear albedo per material name. Saturated on purpose: a grey playground has no colour to bleed. */
const PALETTE: Record<string, Vec3> = {
  s1: grass, s2: grass, s3: grass, s4: grass, s5: grass, s6: grass,
  plaster: [0.8, 0.72, 0.52], wall_rough: [0.55, 0.38, 0.22], wall_segmented: [0.7, 0.7, 0.72], concrete: [0.55, 0.55, 0.55], roof: [0.62, 0.16, 0.08],
  race_track: [0.08, 0.08, 0.09], runway: [0.12, 0.12, 0.13], dirt_road: [0.45, 0.32, 0.18], barrier: [0.75, 0.08, 0.06], side_barrier: [0.8, 0.8, 0.8],
  helipad: [0.9, 0.55, 0.05], arrow_down: [0.9, 0.8, 0.1], ocean: [0.01, 0.05, 0.08],
};

export interface Playground extends Scene { spawns: { type: string; at: Vec3; /** the spawn's three axes, column by column */ basis: number[] }[]; /** where each vehicle's three materials (paint, window, tyre) start in `materials` */ vehicleMaterials: Record<ModelName, number>; /** the character's material */ characterMaterial: number }

export function parsePlayground(file: ArrayBuffer): Playground {
  const view = new DataView(file), jsonBytes = view.getUint32(0, true), header = JSON.parse(new TextDecoder().decode(new Uint8Array(file, 4, jsonBytes))) as { vertices: number; triangles: number; indexBytes: 2 | 4; materials: string[]; spawns: Playground["spawns"] };
  let at = 4 + jsonBytes;
  const vertices = new Float32Array(file, at, header.vertices * 3); at += header.vertices * 12;
  const indices = header.indexBytes === 4 ? new Uint32Array(file, at, header.triangles * 3) : new Uint16Array(file, at, header.triangles * 3); at += Math.ceil((header.triangles * 3 * header.indexBytes) / 4) * 4;
  const material = Array.from(new Uint8Array(file, at, header.triangles));
  const positions = new Array<number>(header.triangles * 9);
  for (let i = 0; i < header.triangles * 3; i++) { const v = indices[i] * 3; positions[i * 3] = vertices[v]; positions[i * 3 + 1] = vertices[v + 1]; positions[i * 3 + 2] = vertices[v + 2]; }
  const materials: Material[] = header.materials.map((name) => ({ albedo: PALETTE[name] ?? [0.6, 0.6, 0.6], emit: [0, 0, 0], mirror: name === "ocean" }));
  const vehicleMaterials = {} as Record<ModelName, number>;
  for (const name of Object.keys(VEHICLE_MATERIALS) as ModelName[]) { vehicleMaterials[name] = materials.length; materials.push(...VEHICLE_MATERIALS[name]); }
  const characterMaterial = materials.push({ albedo: [0.92, 0.78, 0.3], emit: [0, 0, 0] }) - 1;
  return { vehicleMaterials, characterMaterial, positions, material, materials, camera: { eye: [60, 30, 70], target: [0, 14, -5], fov: 50 }, spawns: header.spawns };
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
