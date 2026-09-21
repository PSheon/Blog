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
  /** Reflects like still water: Fresnel's share of the light is mirrored, the rest meets `albedo`. GPU only. */
  mirror?: boolean;
  /** A GGX microfacet metal: `albedo` is its colour at normal incidence, `roughness` 0…1 (squared into GGX's α). GPU only. */
  metallic?: boolean;
  roughness?: number;
  /** Smooth glass of this index of refraction; `albedo` tints what passes through. GPU only. */
  glass?: boolean;
  ior?: number;
  /** A lamp's lens: it glows to the eye and in mirrors, but lights nothing by itself (a spot lamp, asked directly, does that). GPU only. */
  lens?: boolean;
}

export interface Scene {
  /** Nine numbers a triangle: three corners, counter-clockwise seen from outside. */
  positions: number[];
  /** One index into `materials` per triangle. */
  material: number[];
  materials: Material[];
  /** Interpolated normals for curved meshes: nine numbers per smooth triangle, and per triangle its index there (−1 = flat). */
  normals?: number[];
  smooth?: number[];
  /** The lamp a path may ask directly: the parallelogram corner + s·u + t·v, shining along u × v, made of `materials[material]`. */
  light?: { corner: Vec3; u: Vec3; v: Vec3; material: number };
  camera: { eye: Vec3; target: Vec3; /** vertical field of view, degrees */ fov: number };
}

const matte = (r: number, g: number, b: number): Material => ({ albedo: [r, g, b], emit: [0, 0, 0] });

export class SceneBuilder {
  readonly positions: number[] = [];
  readonly material: number[] = [];
  readonly materials: Material[] = [];
  readonly normals: number[] = [];
  readonly smooth: number[] = [];

  add(material: Material): number { return this.materials.push(material) - 1; }

  tri(a: Vec3, b: Vec3, c: Vec3, m: number, normals?: [Vec3, Vec3, Vec3]): void {
    this.positions.push(...a, ...b, ...c); this.material.push(m);
    this.smooth.push(normals ? this.normals.length / 9 : -1);
    if (normals) this.normals.push(...normals[0], ...normals[1], ...normals[2]);
  }

  /** A sphere of `u` × `v` quads with its true normals at the corners, so a few thousand triangles shade as a ball. */
  sphere(centre: Vec3, radius: number, u: number, v: number, m: number): void {
    const dir = (i: number, j: number): Vec3 => { const a = (i / u) * 2 * Math.PI, b = (j / v) * Math.PI; return [Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)]; };
    const at = (n: Vec3): Vec3 => [centre[0] + n[0] * radius, centre[1] + n[1] * radius, centre[2] + n[2] * radius];
    for (let i = 0; i < u; i++) for (let j = 0; j < v; j++) {
      const n00 = dir(i, j), n01 = dir(i, j + 1), n11 = dir(i + 1, j + 1), n10 = dir(i + 1, j);
      if (j < v - 1) this.tri(at(n00), at(n11), at(n01), m, [n00, n11, n01]);
      if (j > 0) this.tri(at(n00), at(n10), at(n11), m, [n00, n10, n11]);
    }
  }

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

  build(camera: Scene["camera"], light?: Scene["light"]): Scene { return { positions: this.positions, material: this.material, materials: this.materials, camera, light, normals: this.normals.length ? this.normals : undefined, smooth: this.normals.length ? this.smooth : undefined }; }
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
  return s.build({ eye: [0, 0, 3.4], target: [0, 0, 0], fov: 41.6 }, { corner: [-l, y, -l], u: [2 * l, 0, 0], v: [0, 0, 2 * l], material: light });
}

export interface StudioOptions { /** half the lamp's side */ lamp?: number; ball?: Partial<Material> }

/**
 * Article 2's room: the Cornell box again, with three balls in place of the tori: one matte, one whose material the
 * reader changes (materials[BALL]), one of glass. The lamp's size is an option, and its radiance is scaled so that it
 * always gives the room the same power: a small lamp is a bright one.
 */
export const BALL = 5;
export function studio({ lamp = 0.3, ball = {} }: StudioOptions = {}): Scene {
  const s = new SceneBuilder(), white = s.add(matte(0.73, 0.73, 0.73)), red = s.add(matte(0.65, 0.05, 0.05)), green = s.add(matte(0.12, 0.45, 0.15));
  const power = 15 * 0.36, e = power / (4 * lamp * lamp), light = s.add({ albedo: [0, 0, 0], emit: [e, e, e] }), blue = s.add(matte(0.2, 0.35, 0.75));
  const middle = s.add({ albedo: [0.95, 0.64, 0.37], emit: [0, 0, 0], metallic: true, roughness: 0.3, ...ball }), glass = s.add({ albedo: [1, 1, 1], emit: [0, 0, 0], glass: true, ior: 1.5 });
  s.quad([-1, -1, -1], [-1, -1, 1], [1, -1, 1], [1, -1, -1], white); s.quad([-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1], white); s.quad([-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], white);
  s.quad([-1, -1, -1], [-1, 1, -1], [-1, 1, 1], [-1, -1, 1], red); s.quad([1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1], green);
  const y = 1 - 1e-3;
  s.quad([-lamp, y, -lamp], [lamp, y, -lamp], [lamp, y, lamp], [-lamp, y, lamp], light);
  s.sphere([-0.58, -0.68, -0.25], 0.32, 48, 24, blue); s.sphere([0.02, -0.62, 0.05], 0.38, 64, 32, middle); s.sphere([0.62, -0.7, 0.4], 0.3, 48, 24, glass);
  return s.build({ eye: [0, 0, 3.4], target: [0, 0, 0], fov: 41.6 }, { corner: [-lamp, y, -lamp], u: [2 * lamp, 0, 0], v: [0, 0, 2 * lamp], material: light });
}
