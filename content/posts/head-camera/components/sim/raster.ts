import { skeleton, type Vec3 } from "./arm";
import { PARAMS } from "./params";
import { nestCentre, type World } from "./world";

/** How far the model's camera is knocked off its mount: radians about the vertical and about its own horizontal, metres. */
export type CameraShift = { yaw: number; pitch: number; dx: number; dy: number; dz: number };
export const NO_SHIFT: CameraShift = { yaw: 0, pitch: 0, dx: 0, dy: 0, dz: 0 };

export type Rgb = [number, number, number];
/** An oriented box: centre, three unit axes, half sizes along them, and the colours of its top, bottom and sides. */
export type Box = { c: Vec3; u: Vec3; v: Vec3; n: Vec3; h: Vec3; top: Rgb; bottom?: Rgb; side?: Rgb };

const C = {
  sky: [24, 28, 44] as Rgb, bench: [196, 198, 208] as Rgb, tray: [70, 76, 96] as Rgb, rail: [120, 128, 150] as Rgb,
  component: [38, 140, 78] as Rgb, solder: [196, 132, 72] as Rgb, edge: [230, 214, 150] as Rgb, pad: [225, 228, 235] as Rgb,
  parts: [[24, 24, 28], [214, 60, 60], [60, 110, 220], [236, 200, 60]] as Rgb[], mark: [245, 245, 245] as Rgb,
  base: [52, 56, 70] as Rgb, link: [240, 140, 40] as Rgb, jaw: [250, 250, 250] as Rgb,
};
const LIGHT: Vec3 = [0.28, 0.2, 0.94];
/** Where the parts sit on the component side: along the board's depth and length (fractions of the half size), and their size. */
const PARTS: [number, number, number, number][] = [[-0.35, -0.5, 0.014, 0.018], [0.4, -0.35, 0.009, 0.009], [0.3, 0.45, 0.012, 0.01], [-0.4, 0.4, 0.008, 0.014]];
const PADS: [number, number][] = [[-0.5, -0.6], [-0.5, 0], [-0.5, 0.6], [0.5, -0.6], [0.5, 0], [0.5, 0.6]];

const add = (a: Vec3, b: Vec3, s = 1): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
/** Rotate `a` about the unit axis `k`. */
const turn = (a: Vec3, k: Vec3, angle: number): Vec3 => add(add([a[0] * Math.cos(angle), a[1] * Math.cos(angle), a[2] * Math.cos(angle)], cross(k, a), Math.sin(angle)), k, dot(k, a) * (1 - Math.cos(angle)));

/** Everything in the world as flat-coloured boxes. */
export function sceneBoxes(world: World): Box[] {
  const boxes: Box[] = [], Z: Vec3 = [0, 0, 1], flat = (c: Vec3, heading: number, h: Vec3, top: Rgb, side?: Rgb): Box => ({ c, u: [Math.cos(heading), Math.sin(heading), 0], v: [-Math.sin(heading), Math.cos(heading), 0], n: Z, h, top, side });
  boxes.push(flat([0.32, 0, -0.01], 0, [0.36, 0.34, 0.01], C.bench));
  for (const nest of [0, 1] as const) {
    const centre = nestCentre(nest), a = PARAMS.nestAngle[nest], t: Vec3 = [-Math.sin(a), Math.cos(a), 0];
    boxes.push(flat([centre[0], centre[1], 0.003], a, [0.06, 0.075, 0.003], C.tray));
    for (const side of [-1, 1]) boxes.push(flat(add([centre[0], centre[1], PARAMS.railZ / 2 - 0.001], t, side * 0.03), a, [0.045, 0.004, PARAMS.railZ / 2 - 0.001], C.rail));
    // The board, and what is mounted on each of its faces.
    const { centre: bc, heading, roll } = world.pose(nest), b = world.boards[nest];
    if (b.lost) continue;
    const u: Vec3 = [Math.cos(heading), Math.sin(heading), 0], v = turn([-Math.sin(heading), Math.cos(heading), 0], u, roll), n = turn(Z, u, roll);
    const hd = PARAMS.board.depth / 2, hl = PARAMS.board.length / 2, ht = PARAMS.board.thickness / 2, face = b.up ? 1 : -1; // +n is the component side when `up`
    boxes.push({ c: bc, u, v, n, h: [hd, hl, ht], top: b.up ? C.component : C.solder, bottom: b.up ? C.solder : C.component, side: C.edge });
    PARTS.forEach(([x, y, sx, sy], k) => boxes.push({ c: add(add(add(bc, u, x * hd), v, y * hl), n, face * (ht + 0.004)), u, v, n, h: [sx, sy, 0.004], top: C.parts[k] }));
    boxes.push({ c: add(add(add(bc, u, 0.75 * hd), v, -0.75 * hl), n, face * (ht + 0.0006)), u, v, n, h: [0.006, 0.006, 0.0006], top: C.mark });
    for (const [x, y] of PADS) boxes.push({ c: add(add(add(bc, u, x * hd), v, y * hl), n, -face * (ht + 0.0006)), u, v, n, h: [0.005, 0.005, 0.0006], top: C.pad });
  }
  // The arm: a base, two links, and two jaws that turn with the wrist.
  const [shoulder, elbow, wrist, tip] = skeleton(world.q);
  boxes.push(flat([0, 0, shoulder[2] / 2], world.q[0], [0.035, 0.035, shoulder[2] / 2], C.base));
  const link = (from: Vec3, to: Vec3, thick: number, colour: Rgb) => {
    const u = unit(add(to, from, -1)), v = unit(cross(Z, u)), n = cross(u, v);
    boxes.push({ c: add(add(from, to), [0, 0, 0], 0).map((x) => x / 2) as Vec3, u, v, n, h: [Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) / 2, thick, thick], top: colour });
  };
  link(shoulder, elbow, 0.016, C.link); link(elbow, wrist, 0.014, C.link);
  const u: Vec3 = [Math.cos(world.q[0]), Math.sin(world.q[0]), 0], v = turn([-Math.sin(world.q[0]), Math.cos(world.q[0]), 0], u, world.q[3]), n = turn(Z, u, world.q[3]);
  boxes.push({ c: add(wrist, u, 0.03), u, v, n, h: [0.03, 0.016, 0.012], top: C.base });
  for (const side of [-1, 1]) boxes.push({ c: add(add(tip, u, -0.012), n, side * (world.closed ? 0.0045 : 0.013)), u, v, n, h: [0.024, 0.014, 0.0025], top: C.jaw });
  return boxes;
}

/**
 * What the model sees: the world drawn by a z-buffer rasteriser into `image` × `image` RGB bytes. Flat shading, one fixed
 * light, no shadows. Written here rather than read back from the GPU so that a test, a node script, a worker and a
 * reader without WebGL all get exactly the same pixels.
 */
export function render(world: World, shift: CameraShift = NO_SHIFT, size: number = PARAMS.image, supersample: number = PARAMS.supersample): Uint8Array {
  return renderBoxes(sceneBoxes(world), PARAMS.camera, shift, size, supersample);
}

/** The same rasteriser for any scene and any camera: the head-camera study (docs/research/head-camera) draws its own. */
export function renderBoxes(boxes: Box[], camera: { eye: Vec3; target: Vec3; fov: number }, shift: CameraShift = NO_SHIFT, size: number = PARAMS.image, supersample: number = PARAMS.supersample): Uint8Array {
  const W = size * supersample, depth = new Float32Array(W * W).fill(Infinity), rgb = new Float32Array(W * W * 3);
  for (let i = 0; i < W * W; i++) { rgb[i * 3] = C.sky[0]; rgb[i * 3 + 1] = C.sky[1]; rgb[i * 3 + 2] = C.sky[2]; }
  const { eye: e0, target, fov } = camera, eye: Vec3 = [e0[0] + shift.dx, e0[1] + shift.dy, e0[2] + shift.dz], Z: Vec3 = [0, 0, 1];
  let f = unit(add(target, e0, -1));
  f = turn(f, Z, shift.yaw); const right0 = unit(cross(f, Z)); f = turn(f, right0, shift.pitch);
  const right = unit(cross(f, Z)), up = cross(right, f), focal = 1 / Math.tan(((fov / 2) * Math.PI) / 180);
  const project = (p: Vec3): Vec3 => { const d = add(p, eye, -1), z = dot(d, f); return [(0.5 + (0.5 * focal * dot(d, right)) / z) * W, (0.5 - (0.5 * focal * dot(d, up)) / z) * W, z]; };

  for (const box of boxes) {
    const corner = (a: number, b: number, c: number) => add(add(add(box.c, box.u, a * box.h[0]), box.v, b * box.h[1]), box.n, c * box.h[2]);
    const faces: [Vec3, Vec3[], Rgb][] = [
      [box.n, [corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1)], box.top],
      [add([0, 0, 0], box.n, -1), [corner(-1, -1, -1), corner(-1, 1, -1), corner(1, 1, -1), corner(1, -1, -1)], box.bottom ?? box.top],
      [box.u, [corner(1, -1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(1, -1, 1)], box.side ?? box.top],
      [add([0, 0, 0], box.u, -1), [corner(-1, -1, -1), corner(-1, -1, 1), corner(-1, 1, 1), corner(-1, 1, -1)], box.side ?? box.top],
      [box.v, [corner(-1, 1, -1), corner(-1, 1, 1), corner(1, 1, 1), corner(1, 1, -1)], box.side ?? box.top],
      [add([0, 0, 0], box.v, -1), [corner(-1, -1, -1), corner(1, -1, -1), corner(1, -1, 1), corner(-1, -1, 1)], box.side ?? box.top],
    ];
    for (const [normal, quad, colour] of faces) {
      if (dot(normal, add(quad[0], eye, -1)) >= 0) continue; // facing away
      const shade = 0.5 + 0.5 * Math.max(0, dot(normal, LIGHT)), p = quad.map(project);
      if (p.some((q) => q[2] < 0.05)) continue;
      for (const [a, b, c] of [[p[0], p[1], p[2]], [p[0], p[2], p[3]]]) fill(a, b, c, colour, shade, W, depth, rgb);
    }
  }
  const out = new Uint8Array(size * size * 3), n = supersample * supersample;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) for (let k = 0; k < 3; k++) {
    let sum = 0;
    for (let j = 0; j < supersample; j++) for (let i = 0; i < supersample; i++) sum += rgb[((y * supersample + j) * W + x * supersample + i) * 3 + k];
    out[(y * size + x) * 3 + k] = Math.round(sum / n);
  }
  return out;
}

function fill(a: Vec3, b: Vec3, c: Vec3, colour: Rgb, shade: number, W: number, depth: Float32Array, rgb: Float32Array): void {
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(area) < 1e-9) return;
  const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(W - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5;
    const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area, w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area, w2 = 1 - w0 - w1;
    if (w0 < 0 || w1 < 0 || w2 < 0) continue;
    const z = 1 / (w0 / a[2] + w1 / b[2] + w2 / c[2]), at = y * W + x;
    if (z >= depth[at]) continue;
    depth[at] = z; rgb[at * 3] = colour[0] * shade; rgb[at * 3 + 1] = colour[1] * shade; rgb[at * 3 + 2] = colour[2] * shade;
  }
}
