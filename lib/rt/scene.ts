/**
 * Scenes as triangle soup. A renderer that only knows triangles has one intersection routine, one bounding box rule
 * and one buffer layout; walls are quads of two triangles, never the huge spheres of smallpt (in f32 their surface
 * shows up as banding). Everything here is plain arrays: the BVH builder packs them for the GPU.
 */
export type Vec3 = [number, number, number];

/** What a surface does to light. `emit` is radiance; a surface with any `emit` is a light. */
export interface Material {
  albedo: Vec3;
  emit: Vec3;
}

export interface Scene {
  /** Nine numbers a triangle: three corners, counter-clockwise seen from outside. */
  positions: number[];
  /** One index into `materials` per triangle. */
  material: number[];
  materials: Material[];
  camera: { eye: Vec3; target: Vec3; /** vertical field of view, degrees */ fov: number };
}

const matte = (r: number, g: number, b: number): Material => ({ albedo: [r, g, b], emit: [0, 0, 0] });

export class SceneBuilder {
  readonly positions: number[] = [];
  readonly material: number[] = [];
  readonly materials: Material[] = [];

  add(material: Material): number { return this.materials.push(material) - 1; }

  tri(a: Vec3, b: Vec3, c: Vec3, m: number): void { this.positions.push(...a, ...b, ...c); this.material.push(m); }

  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, m: number): void { this.tri(a, b, c, m); this.tri(a, c, d, m); }

  /** A torus of `u` × `v` quads around `centre`, tilted about x: the knob that turns 1 000 triangles into a million. */
  torus(centre: Vec3, major: number, minor: number, tilt: number, u: number, v: number, m: number): void {
    const at = (i: number, j: number): Vec3 => {
      const a = (i / u) * 2 * Math.PI, b = (j / v) * 2 * Math.PI, ring = major + minor * Math.cos(b);
      const x = ring * Math.cos(a), y = minor * Math.sin(b), z = ring * Math.sin(a);
      return [centre[0] + x, centre[1] + y * Math.cos(tilt) - z * Math.sin(tilt), centre[2] + y * Math.sin(tilt) + z * Math.cos(tilt)];
    };
    for (let i = 0; i < u; i++) for (let j = 0; j < v; j++) this.quad(at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j), m);
  }

  build(camera: Scene["camera"]): Scene { return { positions: this.positions, material: this.material, materials: this.materials, camera }; }
}

/**
 * The Cornell box (open towards the camera), a square light in the ceiling and six tori, tessellated so that the whole
 * scene has about `triangles` triangles. 12 of them are the box and the light; the rest is tori.
 */
export function cornell(triangles = 1000): Scene {
  const s = new SceneBuilder(), white = s.add(matte(0.73, 0.73, 0.73)), red = s.add(matte(0.65, 0.05, 0.05)), green = s.add(matte(0.12, 0.45, 0.15));
  const light = s.add({ albedo: [0, 0, 0], emit: [15, 15, 15] }), gold = s.add(matte(0.8, 0.6, 0.2)), blue = s.add(matte(0.2, 0.35, 0.75));
  s.quad([-1, -1, -1], [-1, -1, 1], [1, -1, 1], [1, -1, -1], white); // floor
  s.quad([-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1], white); // ceiling
  s.quad([-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], white); // back
  s.quad([-1, -1, -1], [-1, 1, -1], [-1, 1, 1], [-1, -1, 1], red); // left
  s.quad([1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1], green); // right
  const l = 0.3, y = 1 - 1e-3;
  s.quad([-l, y, -l], [l, y, -l], [l, y, l], [-l, y, l], light);
  // u × v quads a torus with u = 2v, six tori: 6 · 2 · (2v · v) = 24 v² triangles.
  const v = Math.max(3, Math.round(Math.sqrt(Math.max(0, triangles - 12) / 24)));
  for (let k = 0; k < 6; k++) s.torus([-0.55 + (k % 3) * 0.55, -0.6 + Math.floor(k / 3) * 0.7, -0.2 + (k % 2) * 0.3], 0.2, 0.07, k * 0.7, 2 * v, v, k % 2 ? blue : gold);
  return s.build({ eye: [0, 0, 3.4], target: [0, 0, 0], fov: 41.6 });
}
