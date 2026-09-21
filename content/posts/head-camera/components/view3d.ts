import type { Vec3 } from "./model";
import { AREA, HEAD } from "./model";

type Three = typeof import("@/lib/three");

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (a: Vec3): Vec3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Where the camera looks after being knocked: the rasteriser's own order (yaw about z, then pitch about its right). */
export function headForward(yaw: number, pitch: number): Vec3 {
  const turn = (a: Vec3, k: Vec3, t: number): Vec3 => {
    const c = Math.cos(t), s = Math.sin(t), kxa = cross(k, a), d = dot(k, a) * (1 - c);
    return [a[0] * c + kxa[0] * s + k[0] * d, a[1] * c + kxa[1] * s + k[1] * d, a[2] * c + kxa[2] * s + k[2] * d];
  };
  const Z: Vec3 = [0, 0, 1];
  let f = unit(sub(HEAD.target, HEAD.eye));
  f = turn(f, Z, yaw);
  return turn(f, unit(cross(f, Z)), pitch);
}

/** Where the four corners of the head camera's picture land on the bench (z = 0), for drawing what it can see. */
function footprint(yaw: number, pitch: number): Vec3[] {
  const f = headForward(yaw, pitch), right = unit(cross(f, [0, 0, 1])), up = cross(right, f), s = Math.tan((HEAD.fov / 2) * (Math.PI / 180));
  return [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([a, b]) => {
    const d: Vec3 = [f[0] + a * s * right[0] + b * s * up[0], f[1] + a * s * right[1] + b * s * up[1], f[2] + a * s * right[2] + b * s * up[2]];
    const k = d[2] < -1e-3 ? Math.min(3, -HEAD.eye[2] / d[2]) : 3; // a ray above the horizon is cut off at 3 m
    return [HEAD.eye[0] + d[0] * k, HEAD.eye[1] + d[1] * k, Math.max(0.002, HEAD.eye[2] + d[2] * k)];
  });
}

/** The page's own colours, so the drawing belongs to the theme. */
function tokens(el: Element) {
  const css = getComputedStyle(el), pick = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return { see: pick("--signal", "#79dafa"), act: pick("--signal-2", "#ff6e96"), think: pick("--signal-3", "#b9a5ff") };
}

/**
 * The bench in WebGL, for people. The arm, block and colours are the ones the head camera's rasteriser draws (so what
 * the reader sees here and what the network sees in the corner are the same world); the grid floor, shadows, the view
 * cone and the belief outline are for people only. z is up, as in the simulator.
 */
export class BenchView {
  private readonly block: import("three").Mesh;
  private readonly blockMaterial: import("three").MeshStandardMaterial;
  private readonly links: import("three").Mesh[];
  private readonly joints: import("three").Mesh[];
  private readonly hand: import("three").Group;
  private readonly head: import("three").Group;
  private readonly ghost: import("three").LineSegments;
  private readonly cone: import("three").LineSegments;
  private readonly patch: import("three").Mesh;
  private readonly patchEdge: import("three").LineSegments;
  private azimuth = -2.2;
  private elevation = 0.6;
  private distance = 1.9;
  private hot = false;

  private constructor(private readonly three: Three, private readonly renderer: import("three").WebGLRenderer, private readonly scene: import("three").Scene, private readonly camera: import("three").PerspectiveCamera) {
    const T = three, colours = tokens(renderer.domElement);
    const mat = (color: number, rough = 0.6) => new T.MeshStandardMaterial({ color, roughness: rough, metalness: 0.08 });
    const shadowy = <M extends import("three").Mesh>(m: M, cast = true) => { m.castShadow = cast; m.receiveShadow = true; return m; };

    scene.add(new T.HemisphereLight(0xeef2ff, 0x30344f, 1.6));
    const sun = new T.DirectionalLight(0xffffff, 2.6);
    sun.position.set(0.9, -0.6, 1.8);
    sun.target.position.set(0.3, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -0.6, right: 0.6, top: 0.6, bottom: -0.6, near: 0.5, far: 4 });
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);

    // A floor that fades into the page: grid tiles under fog the colour of the background.
    const cell = document.createElement("canvas");
    cell.width = cell.height = 64;
    const pen = cell.getContext("2d")!;
    pen.strokeStyle = "rgba(160,170,210,0.55)"; pen.lineWidth = 2; pen.strokeRect(0, 0, 64, 64);
    const tiles = new T.CanvasTexture(cell);
    tiles.wrapS = tiles.wrapT = T.RepeatWrapping;
    tiles.repeat.set(40, 40);
    const floor = new T.Mesh(new T.PlaneGeometry(8, 8), new T.MeshBasicMaterial({ map: tiles, transparent: true, opacity: 0.18, depthWrite: false }));
    floor.position.set(0.3, 0, -0.021);
    scene.add(floor);

    const bench = shadowy(new T.Mesh(new T.BoxGeometry(0.8, 0.72, 0.02), mat(0xd3d6e2, 0.85)), false);
    bench.position.set(0.34, 0, -0.01);
    scene.add(bench);
    // Where training put blocks, the only place a block can be dropped: a dashed violet outline.
    const [x0, x1] = AREA.x, [y0, y1] = AREA.y;
    const area = new T.LineSegments(new T.BufferGeometry().setFromPoints([[x0, y0], [x1, y0], [x1, y0], [x1, y1], [x1, y1], [x0, y1], [x0, y1], [x0, y0]].map(([x, y]) => new T.Vector3(x, y, 0.001))), new T.LineDashedMaterial({ color: colours.think, dashSize: 0.012, gapSize: 0.008 }));
    area.computeLineDistances();
    scene.add(area);

    const base = shadowy(new T.Mesh(new T.CylinderGeometry(0.045, 0.05, 0.12, 32), mat(0x343846, 0.5)));
    base.rotation.x = Math.PI / 2;
    base.position.set(0, 0, 0.06);
    scene.add(base);
    const orange = mat(0xf08c28, 0.45), steel = mat(0x4a4f66, 0.4);
    this.links = [0.018, 0.015, 0.014].map((r) => { const m = shadowy(new T.Mesh(new T.CylinderGeometry(r, r, 1, 20), orange)); scene.add(m); return m; });
    this.joints = [0.026, 0.021, 0.018].map((r) => { const m = shadowy(new T.Mesh(new T.SphereGeometry(r, 20, 14), steel)); scene.add(m); return m; });
    this.hand = new T.Group();
    const cyan = mat(0x3cc8e6, 0.35);
    const palm = shadowy(new T.Mesh(new T.BoxGeometry(0.044, 0.044, 0.018), cyan));
    const fingers = [-1, 1].map((side) => { const f = shadowy(new T.Mesh(new T.BoxGeometry(0.01, 0.008, 0.026), cyan)); f.position.set(0, side * 0.018, -0.02); return f; });
    this.hand.add(palm, ...fingers);
    scene.add(this.hand);

    this.blockMaterial = mat(0xd63c3c, 0.45);
    this.block = shadowy(new T.Mesh(new T.BoxGeometry(0.04, 0.04, 0.04), this.blockMaterial));
    scene.add(this.block);

    // look-once's belief: a dashed pink outline where it thinks the block is.
    const s = 0.023, corners = [[-s, -s], [s, -s], [s, s], [-s, s]], ring = (z: number) => corners.flatMap(([x, y], i) => { const [u, v] = corners[(i + 1) % 4]; return [new T.Vector3(x, y, z), new T.Vector3(u, v, z)]; });
    this.ghost = new T.LineSegments(new T.BufferGeometry().setFromPoints([...ring(-s), ...ring(s), ...corners.flatMap(([x, y]) => [new T.Vector3(x, y, -s), new T.Vector3(x, y, s)])]), new T.LineDashedMaterial({ color: colours.act, dashSize: 0.006, gapSize: 0.004 }));
    this.ghost.computeLineDistances();
    this.ghost.visible = false;
    scene.add(this.ghost);

    // The head camera: a dark body with a glowing lens, its four sight lines, and the patch of bench it can see.
    this.head = new T.Group();
    const body = shadowy(new T.Mesh(new T.BoxGeometry(0.06, 0.045, 0.045), mat(0x1b1f33, 0.35)));
    const lens = new T.Mesh(new T.CylinderGeometry(0.014, 0.016, 0.02, 20), new T.MeshBasicMaterial({ color: colours.see }));
    lens.rotation.x = Math.PI / 2;
    lens.position.z = 0.028;
    body.add(lens);
    this.head.add(body);
    this.head.position.set(...HEAD.eye);
    scene.add(this.head);
    this.cone = new T.LineSegments(new T.BufferGeometry().setFromPoints(Array.from({ length: 8 }, () => new T.Vector3())), new T.LineBasicMaterial({ color: colours.see, transparent: true, opacity: 0.3 }));
    scene.add(this.cone);
    const patchGeometry = new T.BufferGeometry();
    patchGeometry.setAttribute("position", new T.BufferAttribute(new Float32Array(12), 3));
    patchGeometry.setIndex([0, 1, 2, 0, 2, 3]);
    this.patch = new T.Mesh(patchGeometry, new T.MeshBasicMaterial({ color: colours.see, transparent: true, opacity: 0.08, depthWrite: false, side: T.DoubleSide }));
    scene.add(this.patch);
    this.patchEdge = new T.LineSegments(new T.BufferGeometry().setFromPoints(Array.from({ length: 8 }, () => new T.Vector3())), new T.LineBasicMaterial({ color: colours.see, transparent: true, opacity: 0.85 }));
    scene.add(this.patchEdge);
    this.retheme();
  }

  static async create(canvas: HTMLCanvasElement): Promise<BenchView> {
    const three = await import("@/lib/three");
    const renderer = new three.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = three.PCFShadowMap;
    const camera = new three.PerspectiveCamera(34, 1.5, 0.02, 20);
    camera.up.set(0, 0, 1);
    return new BenchView(three, renderer, new three.Scene(), camera);
  }

  /** Fog the colour of whatever is behind the canvas, so the floor's edge disappears into the page in either theme. */
  retheme() {
    const T = this.three;
    let el: Element | null = this.renderer.domElement, paper = "rgba(0, 0, 0, 0)";
    while (el && paper === "rgba(0, 0, 0, 0)") { paper = getComputedStyle(el).backgroundColor; el = el.parentElement; }
    this.scene.fog = new T.Fog(new T.Color(paper === "rgba(0, 0, 0, 0)" ? "#0a0c1e" : paper), 1.8, 3.8);
  }

  orbit(dx: number, dy: number) {
    this.azimuth -= dx * 0.008;
    this.elevation = Math.max(0.15, Math.min(1.4, this.elevation + dy * 0.006));
  }

  /** The point on the plane z = height under a pointer, in simulator metres; null if the ray misses it. */
  benchAt(ndcX: number, ndcY: number, height = 0.02): [number, number] | null {
    const T = this.three, ray = new T.Raycaster();
    ray.setFromCamera(new T.Vector2(ndcX, ndcY), this.camera);
    const hit = new T.Vector3();
    return ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 0, 1), -height), hit) ? [hit.x, hit.y] : null;
  }

  /** A press counts as grabbing the block when it lands on it or on the bench within 5 cm of it: a 4 cm block is small on a phone. */
  grabs(ndcX: number, ndcY: number): boolean {
    const T = this.three, ray = new T.Raycaster();
    ray.setFromCamera(new T.Vector2(ndcX, ndcY), this.camera);
    if (ray.intersectObject(this.block).length > 0) return true;
    const p = this.benchAt(ndcX, ndcY);
    return p !== null && Math.hypot(p[0] - this.block.position.x, p[1] - this.block.position.y) < 0.05;
  }

  /** Light the block up while the pointer is over it or holding it. */
  highlight(on: boolean) {
    if (on === this.hot) return;
    this.hot = on;
    this.blockMaterial.emissive.set(on ? 0x6a1414 : 0x000000);
  }

  render(bones: Vec3[] | null, block: [number, number], ghost: [number, number] | null, look: { yaw: number; pitch: number }) {
    const T = this.three, canvas = this.renderer.domElement, w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * this.renderer.getPixelRatio()) || canvas.height !== Math.round(h * this.renderer.getPixelRatio())) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      // A narrow view (a phone) opens up so the whole bench stays in frame.
      this.camera.fov = w / h < 1.3 ? 46 : 32;
      this.camera.updateProjectionMatrix();
    }
    if (bones) {
      const [shoulder, elbow, wrist, tip] = bones;
      ([[shoulder, elbow], [elbow, wrist], [wrist, tip]] as [Vec3, Vec3][]).forEach(([a, b], i) => {
        const m = this.links[i], d = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
        m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
        m.scale.set(1, len, 1);
        m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); // a cylinder's axis is y
      });
      [shoulder, elbow, wrist].forEach((p, i) => this.joints[i].position.set(...p));
      this.hand.position.set(...tip);
      this.hand.rotation.z = Math.atan2(tip[1], tip[0]);
    }
    this.block.position.set(block[0], block[1], 0.02);
    this.ghost.visible = ghost !== null;
    if (ghost) this.ghost.position.set(ghost[0], ghost[1], 0.023);

    const f = headForward(look.yaw, look.pitch), corners = footprint(look.yaw, look.pitch);
    this.head.lookAt(HEAD.eye[0] + f[0], HEAD.eye[1] + f[1], HEAD.eye[2] + f[2]); // Object3D.lookAt points +z at the target
    const cone = this.cone.geometry.getAttribute("position") as import("three").BufferAttribute;
    const patch = this.patch.geometry.getAttribute("position") as import("three").BufferAttribute;
    const edge = this.patchEdge.geometry.getAttribute("position") as import("three").BufferAttribute;
    corners.forEach((c, i) => {
      const next = corners[(i + 1) % 4];
      cone.setXYZ(i * 2, ...HEAD.eye); cone.setXYZ(i * 2 + 1, ...c);
      patch.setXYZ(i, ...c);
      edge.setXYZ(i * 2, ...c); edge.setXYZ(i * 2 + 1, ...next);
    });
    cone.needsUpdate = patch.needsUpdate = edge.needsUpdate = true;
    this.patch.geometry.computeBoundingSphere();
    this.cone.geometry.computeBoundingSphere();
    this.patchEdge.geometry.computeBoundingSphere();

    const c = new T.Vector3(0.2, 0.08, 0.2), r = this.distance; // between bench, arm and head camera
    this.camera.position.set(c.x + r * Math.cos(this.elevation) * Math.cos(this.azimuth), c.y + r * Math.cos(this.elevation) * Math.sin(this.azimuth), c.z + r * Math.sin(this.elevation));
    this.camera.lookAt(c);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
  }
}
