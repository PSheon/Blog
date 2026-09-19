"use client";

import { type RefObject, useEffect, useRef } from "react";
import type * as THREE from "three";
import type { Pose } from "./se2";
import type { Segment } from "./world";

type Three = typeof THREE;
export const CYAN_HEX = 0x79dafa, PINK_HEX = 0xff6e96, VIOLET_HEX = 0xb9a5ff;

/** A z-up three.js scene on one canvas: lights, a faint floor grid in the page's ink colour, and resize handling. */
export class Stage3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly ink: THREE.Color;

  constructor(readonly T: Three, readonly canvas: HTMLCanvasElement, { fov = 38, grid = [10, 7] as [number, number] } = {}) {
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(fov, 2, 0.1, 150);
    this.camera.up.set(0, 0, 1);
    this.ink = new T.Color(getComputedStyle(canvas).color);
    this.scene.add(new T.HemisphereLight(0xffffff, 0x222244, 2.4));
    const sun = new T.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-6, -10, 14);
    this.scene.add(sun);
    const floor = new T.GridHelper(60, 60, this.ink, this.ink);
    floor.rotation.x = Math.PI / 2;
    floor.position.set(grid[0], grid[1], 0);
    (floor.material as THREE.Material).transparent = true;
    (floor.material as THREE.Material).opacity = 0.12;
    this.scene.add(floor);
  }

  /** Look at (x, y) on the floor from the south, `back` metres away and `up` metres high. */
  aim(x: number, y: number, back: number, up: number) {
    this.camera.position.set(x, y - back, up);
    this.camera.lookAt(x, y, 0);
  }

  render() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight, ratio = this.renderer.getPixelRatio();
    if (this.canvas.width !== Math.round(w * ratio) || this.canvas.height !== Math.round(h * ratio)) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Walls as thin boxes; `opacity` low for "this is only here for reference". */
  walls(world: Segment[], height: number, opacity: number): THREE.Group {
    const T = this.T, group = new T.Group(), material = new T.MeshStandardMaterial({ color: this.ink, roughness: 0.8, transparent: true, opacity, depthWrite: opacity > 0.5 });
    for (const [x0, y0, x1, y1] of world) {
      const wall = new T.Mesh(new T.BoxGeometry(Math.hypot(x1 - x0, y1 - y0) + 0.08, 0.08, height), material);
      wall.position.set((x0 + x1) / 2, (y0 + y1) / 2, height / 2);
      wall.rotation.z = Math.atan2(y1 - y0, x1 - x0);
      group.add(wall);
    }
    this.scene.add(group);
    return group;
  }

  line(color: number | THREE.Color, opacity = 1, segments = false): THREE.Line {
    const T = this.T, material = new T.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
    const obj = segments ? new T.LineSegments(new T.BufferGeometry(), material) : new T.Line(new T.BufferGeometry(), material);
    this.scene.add(obj);
    return obj;
  }

  car(color: number): THREE.Group {
    const T = this.T, g = new T.Group(), body = new T.Mesh(new T.BoxGeometry(0.62, 0.4, 0.2), new T.MeshStandardMaterial({ color, roughness: 0.4 }));
    body.position.z = 0.2;
    const nose = new T.Mesh(new T.ConeGeometry(0.13, 0.3, 12), new T.MeshStandardMaterial({ color: 0xffffff }));
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(0.42, 0, 0.2);
    g.add(body, nose);
    this.scene.add(g);
    return g;
  }

  /** Where a pointer position on the canvas hits the floor. */
  floorPoint(clientX: number, clientY: number): [number, number] | null {
    const T = this.T, box = this.canvas.getBoundingClientRect(), ray = new T.Raycaster(), hit = new T.Vector3();
    ray.setFromCamera(new T.Vector2(((clientX - box.left) / box.width) * 2 - 1, 1 - ((clientY - box.top) / box.height) * 2), this.camera);
    return ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 0, 1), 0), hit) ? [hit.x, hit.y] : null;
  }

  dispose() {
    this.renderer.dispose();
  }
}

export function setPoints(T: Three, obj: { geometry: THREE.BufferGeometry }, data: number[]) {
  obj.geometry.setAttribute("position", new T.BufferAttribute(Float32Array.from(data), 3));
  obj.geometry.computeBoundingSphere();
}

export function place(obj: THREE.Object3D, p: Pose) {
  obj.position.set(p.x, p.y, 0);
  obj.rotation.z = p.theta;
}

/** Scan points stood up as short vertical strokes, so a scan reads as walls rather than dust. */
export function stubs(points: Float64Array, pose: Pose, height: number, out: number[] = []): number[] {
  const c = Math.cos(pose.theta), s = Math.sin(pose.theta);
  for (let i = 0; i < points.length; i += 2) {
    const x = pose.x + c * points[i] - s * points[i + 1], y = pose.y + s * points[i] + c * points[i + 1];
    out.push(x, y, 0, x, y, height);
  }
  return out;
}

/**
 * Creates a Stage3D the first time the canvas is on screen (browsers ration WebGL contexts, and this article has six),
 * runs `build` once, then `frame` on every animation frame while visible.
 */
export function useStage3D<S>(canvas: RefObject<HTMLCanvasElement | null>, visible: RefObject<boolean>, build: (stage: Stage3D) => S, frame: (stage: Stage3D, built: S) => void, options?: { fov?: number; grid?: [number, number] }) {
  const live = useRef<{ stage: Stage3D; built: S } | null>(null), latest = useRef(frame);
  useEffect(() => { latest.current = frame; });
  useEffect(() => {
    let raf = 0, cancelled = false, loading = false;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible.current) return;
      if (!live.current) {
        if (loading || !canvas.current) return;
        loading = true;
        void import("three").then((T) => {
          if (cancelled || !canvas.current) return;
          const stage = new Stage3D(T, canvas.current, options);
          live.current = { stage, built: build(stage) };
        });
        return;
      }
      latest.current(live.current.stage, live.current.built);
      live.current.stage.render();
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelled = true; cancelAnimationFrame(raf); live.current?.stage.dispose(); live.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- build once per mount; `frame` is read through a ref
  }, []);
  return live;
}
