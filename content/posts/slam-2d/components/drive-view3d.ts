import type * as THREE from "three";
import { type Pose, compose } from "./se2";
import type { Slam } from "./slam";
import { followInk } from "./stage3d";
import type { Segment } from "./world";

type Three = typeof import("@/lib/three");
const WALL = 1.0, STUB = 0.7, CYAN = 0x79dafa, PINK = 0xff6e96, VIOLET = 0xb9a5ff;

export interface DriveFrame {
  truth: Pose;
  /** The latest scan, in the car's frame. */
  scan: Float64Array;
  slam: Slam;
  /** Poses from adding up the odometer, in the map's frame. */
  wheels: Pose[];
  /** Where the map's origin sits in the world, so both halves are drawn the same way up. */
  origin: Pose;
  wrong: { from: number; to: number } | null;
}

/**
 * Both halves of the driving instruments in one WebGL canvas: on the left the real world from behind the car,
 * on the right the car's own map seen from above. One canvas, two viewports, because browsers ration WebGL contexts.
 * Everything is z-up.
 */
export class DriveView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly real: THREE.Scene;
  private readonly map: THREE.Scene;
  private readonly chase: THREE.PerspectiveCamera;
  private readonly above: THREE.PerspectiveCamera;
  private readonly carReal: THREE.Object3D;
  private readonly carMap: THREE.Object3D;
  private readonly rays: THREE.LineSegments;
  private readonly stubs: THREE.LineSegments;
  private readonly slamPath: THREE.Line;
  private readonly wheelPath: THREE.Line;
  private readonly links: THREE.LineSegments;
  private readonly badLink: THREE.Line;
  private mapVersion = "";
  private eye: [number, number, number] | null = null;
  private readonly unfollow: () => void;

  constructor(private readonly T: Three, private readonly canvas: HTMLCanvasElement, world: Segment[]) {
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setScissorTest(true);
    const ink = new T.Color(getComputedStyle(canvas).color);
    this.real = new T.Scene(); this.map = new T.Scene();
    this.unfollow = followInk(T, canvas, () => [this.real, this.map], ink); // the lab draws every frame, so no redraw to ask for
    this.chase = new T.PerspectiveCamera(55, 1, 0.1, 80); this.above = new T.PerspectiveCamera(38, 1, 0.1, 120);
    this.chase.up.set(0, 0, 1); this.above.up.set(0, 0, 1);

    for (const scene of [this.real, this.map]) {
      scene.add(new T.HemisphereLight(0xffffff, 0x222244, 2.4));
      const sun = new T.DirectionalLight(0xffffff, 1.6); sun.position.set(-6, -10, 14); scene.add(sun);
      const grid = new T.GridHelper(60, 60, ink, ink); grid.rotation.x = Math.PI / 2; grid.position.set(10, 7, 0);
      (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = 0.12;
      scene.add(grid);
    }
    const wallMaterial = new T.MeshStandardMaterial({ color: ink, roughness: 0.8, transparent: true, opacity: 0.85 });
    for (const [x0, y0, x1, y1] of world) {
      const wall = new T.Mesh(new T.BoxGeometry(Math.hypot(x1 - x0, y1 - y0) + 0.08, 0.08, WALL), wallMaterial);
      wall.position.set((x0 + x1) / 2, (y0 + y1) / 2, WALL / 2); wall.rotation.z = Math.atan2(y1 - y0, x1 - x0);
      this.real.add(wall);
    }
    const makeCar = () => {
      const g = new T.Group(), body = new T.Mesh(new T.BoxGeometry(0.62, 0.4, 0.2), new T.MeshStandardMaterial({ color: CYAN, roughness: 0.4 }));
      body.position.z = 0.2;
      const nose = new T.Mesh(new T.ConeGeometry(0.13, 0.3, 12), new T.MeshStandardMaterial({ color: 0xffffff }));
      nose.rotation.z = -Math.PI / 2; nose.position.set(0.42, 0, 0.2);
      const lidar = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 0.12, 16), new T.MeshStandardMaterial({ color: 0x222233 }));
      lidar.rotation.x = Math.PI / 2; lidar.position.z = 0.36;
      g.add(body, nose, lidar);
      return g;
    };
    this.carReal = makeCar(); this.carMap = makeCar();
    this.real.add(this.carReal); this.map.add(this.carMap);
    const line = (color: number, opacity = 1) => new T.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
    this.rays = new T.LineSegments(new T.BufferGeometry(), line(CYAN, 0.22)); this.real.add(this.rays);
    this.stubs = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.55 }));
    this.slamPath = new T.Line(new T.BufferGeometry(), line(CYAN)); this.wheelPath = new T.Line(new T.BufferGeometry(), line(PINK));
    this.links = new T.LineSegments(new T.BufferGeometry(), line(VIOLET, 0.5)); this.badLink = new T.Line(new T.BufferGeometry(), line(PINK));
    this.map.add(this.stubs, this.slamPath, this.wheelPath, this.links, this.badLink);
  }

  render(f: DriveFrame, stacked: boolean) {
    const T = this.T, canvas = this.canvas, w = canvas.clientWidth, h = canvas.clientHeight, ratio = this.renderer.getPixelRatio();
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) this.renderer.setSize(w, h, false);
    const set = (obj: { geometry: THREE.BufferGeometry }, data: number[]) => { obj.geometry.setAttribute("position", new T.BufferAttribute(Float32Array.from(data), 3)); obj.geometry.computeBoundingSphere(); };

    // Left: the real car, its beams, and a camera that trails behind it.
    const t = f.truth, c = Math.cos(t.theta), s = Math.sin(t.theta);
    this.carReal.position.set(t.x, t.y, 0); this.carReal.rotation.z = t.theta;
    const rays: number[] = [];
    for (let i = 0; i < f.scan.length; i += 2) rays.push(t.x, t.y, 0.36, t.x + c * f.scan[i] - s * f.scan[i + 1], t.y + s * f.scan[i] + c * f.scan[i + 1], 0.36);
    set(this.rays, rays);
    const want: [number, number, number] = [t.x - c * 3.2, t.y - s * 3.2, 4.2]; // high enough to see over a wall the car has its back to
    this.eye = this.eye ? [0, 1, 2].map((k) => this.eye![k] + (want[k] - this.eye![k]) * 0.08) as [number, number, number] : want;
    this.chase.position.set(...this.eye); this.chase.lookAt(t.x + c * 1.5, t.y + s * 1.5, 0.3);

    // Right: the map is every remembered scan, stood up as little wall stubs where the car now believes it was taken.
    const version = `${f.slam.keyframes.length}:${f.slam.closures.length}:${f.wrong ? 1 : 0}`;
    if (version !== this.mapVersion) {
      this.mapVersion = version;
      const stubs: number[] = [], path: number[] = [], links: number[] = [];
      for (const k of f.slam.keyframes) {
        const p = compose(f.origin, k.pose), pc = Math.cos(p.theta), ps = Math.sin(p.theta);
        path.push(p.x, p.y, 0.05);
        for (let i = 0; i < k.points.length; i += 2) { const x = p.x + pc * k.points[i] - ps * k.points[i + 1], y = p.y + ps * k.points[i] + pc * k.points[i + 1]; stubs.push(x, y, 0, x, y, STUB); }
      }
      let bad: number[] = [];
      for (const e of f.slam.edges) {
        if (e.kind !== "loop") continue;
        const a = compose(f.origin, f.slam.keyframes[e.from].pose), b = compose(f.origin, f.slam.keyframes[e.to].pose), seg = [a.x, a.y, 0.08, b.x, b.y, 0.08];
        if (f.wrong && e.from === f.wrong.from && e.to === f.wrong.to) bad = seg; else links.push(...seg);
      }
      set(this.stubs, stubs); set(this.slamPath, path); set(this.links, links); set(this.badLink, bad);
    }
    const wheels: number[] = [];
    for (let i = 0; i < f.wheels.length; i += 6) { const p = compose(f.origin, f.wheels[i]); wheels.push(p.x, p.y, 0.03); }
    set(this.wheelPath, wheels);
    const believed = compose(f.origin, f.slam.pose);
    this.carMap.position.set(believed.x, believed.y, 0); this.carMap.rotation.z = believed.theta;

    // Side by side when there is room, stacked on a phone.
    const gap = 10, vw = stacked ? w : (w - gap) / 2, vh = stacked ? (h - gap) / 2 : h;
    const views: [THREE.Scene, THREE.PerspectiveCamera, number, number][] = [[this.real, this.chase, 0, stacked ? vh + gap : 0], [this.map, this.above, stacked ? 0 : vw + gap, 0]];
    this.above.position.set(10, 7 - 17, 21); this.above.lookAt(10, 6.2, 0);
    for (const [scene, camera, x, y] of views) {
      camera.aspect = vw / vh; camera.updateProjectionMatrix();
      this.renderer.setViewport(x, y, vw, vh); this.renderer.setScissor(x, y, vw, vh);
      this.renderer.render(scene, camera);
    }
  }

  dispose() {
    this.unfollow();
    this.renderer.dispose();
  }
}
