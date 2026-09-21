import type * as THREE from "three";
import { type Outcome, START } from "./outcomes";
import { compose } from "./se2";
import { CYAN_HEX, PINK_HEX, VIOLET_HEX, followInk, setPoints, stubs, tone } from "./stage3d";

type Three = typeof import("@/lib/three");

/** Four finished maps in one WebGL canvas, a 2 × 2 grid of viewports: one context instead of four. */
export class OutcomesView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly scenes: THREE.Scene[] = [];
  private readonly ink: THREE.Color;
  private readonly unfollow: () => void;

  constructor(private readonly T: Three, private readonly canvas: HTMLCanvasElement) {
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setScissorTest(true);
    this.camera = new T.PerspectiveCamera(38, 1, 0.1, 150);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(10, 7 - 19, 24);
    this.camera.lookAt(10, 6.4, 0);
    this.ink = new T.Color(getComputedStyle(canvas).color);
    // Drawn once per result, not per frame: a change of theme has to ask for the picture again.
    this.unfollow = followInk(T, canvas, () => this.scenes.filter(Boolean), this.ink, () => this.render());
  }

  /** Build (or rebuild) the scene in cell `i` from a finished run. */
  show(i: number, o: Outcome) {
    const T = this.T, scene = new T.Scene(), ink = this.ink;
    const grid = new T.GridHelper(60, 30, ink, ink);
    grid.rotation.x = Math.PI / 2; grid.position.set(10, 7, 0);
    (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = 0.1;
    scene.add(grid);
    const line = (color: number | THREE.Color, data: number[], opacity = 1, segments = false) => {
      const m = new T.LineBasicMaterial({ color, transparent: opacity < 1, opacity }), obj = segments ? new T.LineSegments(new T.BufferGeometry(), m) : new T.Line(new T.BufferGeometry(), m);
      setPoints(T, obj, data); scene.add(obj);
    };
    const at = o.keyframes.map((k) => compose(START, k.pose)), map: number[] = [];
    o.keyframes.forEach((k, j) => { if (j % 2 === 0) stubs(k.points, at[j], 0.7, map); });
    line(ink, map, 0.55, true);
    line(tone(PINK_HEX), o.wheels.flatMap((p) => { const q = compose(START, p); return [q.x, q.y, 0.03]; }));
    line(tone(CYAN_HEX), at.flatMap((q) => [q.x, q.y, 0.06]));
    line(tone(VIOLET_HEX), o.loops.filter(([a, b]) => !(o.wrong && a === o.wrong.from && b === o.wrong.to)).flatMap(([a, b]) => [at[a].x, at[a].y, 0.08, at[b].x, at[b].y, 0.08]), 0.5, true);
    if (o.wrong) line(tone(PINK_HEX), [at[o.wrong.from].x, at[o.wrong.from].y, 0.1, at[o.wrong.to].x, at[o.wrong.to].y, 0.1]);
    this.scenes[i] = scene;
    this.render();
  }

  render() {
    const canvas = this.canvas, w = canvas.clientWidth, h = canvas.clientHeight, ratio = this.renderer.getPixelRatio();
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) this.renderer.setSize(w, h, false);
    const gap = 10, vw = (w - gap) / 2, vh = (h - gap) / 2;
    // Keep the whole ring in frame whatever the cell's shape: hold the horizontal field of view, let the vertical one follow.
    this.camera.aspect = vw / vh;
    this.camera.fov = Math.max(38, (2 * Math.atan(Math.tan((58 * Math.PI) / 360) / this.camera.aspect) * 180) / Math.PI);
    this.camera.updateProjectionMatrix();
    this.renderer.setScissor(0, 0, w, h); this.renderer.clear();
    this.scenes.forEach((scene, i) => {
      if (!scene) return;
      const x = (i % 2) * (vw + gap), y = (1 - Math.floor(i / 2)) * (vh + gap); // GL's y runs upward
      this.renderer.setViewport(x, y, vw, vh); this.renderer.setScissor(x, y, vw, vh);
      this.renderer.render(scene, this.camera);
    });
  }

  dispose() {
    this.unfollow();
    this.renderer.dispose();
  }
}
