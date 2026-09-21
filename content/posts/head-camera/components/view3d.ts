import type { Vec3 } from "./model";
import { HEAD } from "./model";

type Three = typeof import("@/lib/three");
type Mesh = import("three").Mesh;

/** Where the camera looks after being knocked: the rasteriser's own order (yaw about z, then pitch about its right). */
export function headForward(yaw: number, pitch: number): Vec3 {
  const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const unit = (a: Vec3): Vec3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const turn = (a: Vec3, k: Vec3, t: number): Vec3 => {
    const c = Math.cos(t), s = Math.sin(t), kxa = cross(k, a), d = dot(k, a) * (1 - c);
    return [a[0] * c + kxa[0] * s + k[0] * d, a[1] * c + kxa[1] * s + k[1] * d, a[2] * c + kxa[2] * s + k[2] * d];
  };
  const Z: Vec3 = [0, 0, 1];
  let f = unit(sub(HEAD.target, HEAD.eye));
  f = turn(f, Z, yaw);
  return turn(f, unit(cross(f, Z)), pitch);
}

/**
 * The bench in WebGL, for people: the same boxes the head camera's rasteriser draws, lit, and a view the reader can turn.
 * z is up, as in the simulator. The arm's joints come from the simulator every frame; this class only places meshes.
 */
export class BenchView {
  readonly block: Mesh;
  private readonly links: Mesh[];
  private readonly hand: Mesh;
  private readonly head: import("three").Group;
  private readonly ghost: Mesh;
  private azimuth = -2.35;
  private elevation = 0.55;
  private distance = 1.75;

  constructor(private readonly three: Three, private readonly renderer: import("three").WebGLRenderer, private readonly scene: import("three").Scene, readonly camera: import("three").PerspectiveCamera) {
    const T = three, mat = (color: number, rough = 0.7) => new T.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05 });
    scene.add(new T.HemisphereLight(0xe6ecff, 0x2a2e48, 2.1));
    const sun = new T.DirectionalLight(0xffffff, 2.2);
    sun.position.set(0.6, -0.8, 1.6);
    scene.add(sun);
    const bench = new T.Mesh(new T.BoxGeometry(0.8, 0.72, 0.02), mat(0xc4c6d0, 0.9));
    bench.position.set(0.34, 0, -0.01);
    scene.add(bench);
    // Where training put blocks: the only region the reader can drop one in.
    const area = new T.Mesh(new T.PlaneGeometry(0.28, 0.44), new T.MeshBasicMaterial({ color: 0x6347d9, transparent: true, opacity: 0.1, depthWrite: false }));
    area.position.set(0.36, 0, 0.001);
    scene.add(area);
    const base = new T.Mesh(new T.BoxGeometry(0.07, 0.07, 0.12), mat(0x343846));
    base.position.set(0, 0, 0.06);
    scene.add(base);
    this.links = [0.032, 0.028, 0.028].map((thick) => { const m = new T.Mesh(new T.BoxGeometry(1, thick, thick), mat(0xf08c28, 0.5)); scene.add(m); return m; });
    this.hand = new T.Mesh(new T.BoxGeometry(0.044, 0.044, 0.028), mat(0x3cc8e6, 0.4));
    scene.add(this.hand);
    this.block = new T.Mesh(new T.BoxGeometry(0.04, 0.04, 0.04), mat(0xd63c3c, 0.5));
    scene.add(this.block);
    // look-once's belief: where it thinks the block is.
    this.ghost = new T.Mesh(new T.BoxGeometry(0.04, 0.04, 0.04), new T.MeshBasicMaterial({ color: 0xd63c3c, wireframe: true }));
    this.ghost.visible = false;
    scene.add(this.ghost);
    // The head camera: a small body and a cone pointing where it looks.
    this.head = new T.Group();
    const body = new T.Mesh(new T.BoxGeometry(0.05, 0.05, 0.05), mat(0x12162a, 0.4));
    const lens = new T.Mesh(new T.ConeGeometry(0.035, 0.08, 20, 1, true), new T.MeshBasicMaterial({ color: 0x79dafa, transparent: true, opacity: 0.45, side: T.BackSide }));
    lens.rotation.x = -Math.PI / 2; // a cone's apex is +y: turn it to −z, so its open end faces +z, where lookAt points
    lens.position.z = 0.05;
    body.add(lens);
    this.head.add(body);
    this.head.position.set(...HEAD.eye);
    scene.add(this.head);
  }

  static async create(canvas: HTMLCanvasElement): Promise<BenchView> {
    const three = await import("@/lib/three");
    const renderer = new three.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    const camera = new three.PerspectiveCamera(38, 1.5, 0.02, 20);
    camera.up.set(0, 0, 1);
    return new BenchView(three, renderer, new three.Scene(), camera);
  }

  orbit(dx: number, dy: number) {
    this.azimuth -= dx * 0.008;
    this.elevation = Math.max(0.12, Math.min(1.45, this.elevation + dy * 0.006));
  }

  /** The point on the bench top (z = 0.04, the block's top) under a pointer, in simulator metres; null if it misses. */
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

  render(bones: Vec3[] | null, block: [number, number], ghost: [number, number] | null, look: { yaw: number; pitch: number }) {
    const T = this.three, canvas = this.renderer.domElement, w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * this.renderer.getPixelRatio()) || canvas.height !== Math.round(h * this.renderer.getPixelRatio())) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    if (bones) {
      const [shoulder, elbow, wrist, tip] = bones, pairs: [Vec3, Vec3][] = [[shoulder, elbow], [elbow, wrist], [wrist, tip]];
      pairs.forEach(([a, b], i) => {
        const m = this.links[i], d = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
        m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
        m.scale.set(len, 1, 1);
        m.quaternion.setFromUnitVectors(new T.Vector3(1, 0, 0), d.normalize());
      });
      this.hand.position.set(...tip);
    }
    this.block.position.set(block[0], block[1], 0.02);
    this.ghost.visible = ghost !== null;
    if (ghost) this.ghost.position.set(ghost[0], ghost[1], 0.02);
    const f = headForward(look.yaw, look.pitch);
    this.head.lookAt(HEAD.eye[0] + f[0], HEAD.eye[1] + f[1], HEAD.eye[2] + f[2]); // Object3D.lookAt points +z at the target
    const c = new T.Vector3(0.2, 0.06, 0.2), r = this.distance; // the middle of bench, arm and head camera
    this.camera.position.set(c.x + r * Math.cos(this.elevation) * Math.cos(this.azimuth), c.y + r * Math.cos(this.elevation) * Math.sin(this.azimuth), c.z + r * Math.sin(this.elevation));
    this.camera.lookAt(c);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
  }
}
