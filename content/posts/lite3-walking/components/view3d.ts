import type { BufferGeometry } from "three";
import { ASSET_VERSION } from "./sim";

const ASSETS = "/lite3/visual";
/** Which mesh each MuJoCo body wears; index = body id (0 is the world). Right thighs are mirrored, as in the MJCF. */
const PARTS: ({ mesh: string; mirror?: boolean } | null)[] = [null, { mesh: "torso" }];
for (const side of ["FL", "FR", "HL", "HR"]) {
  PARTS.push({ mesh: "hip" }, { mesh: "thigh", mirror: side[1] === "R" }, { mesh: "shank" }, null);
}

export interface Pose {
  bodies: Float64Array;
  orientations: Float64Array;
}

/** A chase-camera WebGL view of the robot. MuJoCo is z-up, so the whole scene is too. */
export class Lite3View {
  private constructor(
    private readonly three: typeof import("@/lib/three"),
    private readonly renderer: import("three").WebGLRenderer,
    private readonly scene: import("three").Scene,
    private readonly camera: import("three").PerspectiveCamera,
    private readonly parts: (import("three").Object3D | null)[],
    private readonly grid: import("three").Object3D,
    private readonly shadow: import("three").Object3D,
    private readonly cell: HTMLCanvasElement,
    private readonly tiles: import("three").CanvasTexture,
  ) {}

  /** Read the page's colours so the floor belongs to the current theme; fog hides the grid's far edge. */
  retheme() {
    const css = getComputedStyle(this.renderer.domElement), ink = new this.three.Color(css.color);
    const paper = css.backgroundColor === "rgba(0, 0, 0, 0)" ? getComputedStyle(document.body).backgroundColor : css.backgroundColor;
    this.scene.fog = new this.three.Fog(new this.three.Color(paper), 3, 9);
    const pen = this.cell.getContext("2d")!;
    pen.clearRect(0, 0, 128, 128);
    pen.strokeStyle = `#${ink.getHexString()}`;
    pen.lineWidth = 3;
    pen.strokeRect(0, 0, 128, 128);
    this.tiles.needsUpdate = true;
  }

  static async create(canvas: HTMLCanvasElement): Promise<Lite3View> {
    const [three, { STLLoader }] = await Promise.all([import("@/lib/three"), import("three/examples/jsm/loaders/STLLoader.js")]);
    const loader = new STLLoader();
    const names = ["torso", "hip", "thigh", "shank"];
    const loaded = await Promise.all(names.map((n) => loader.loadAsync(`${ASSETS}/${n}.bin?v=${ASSET_VERSION}`)));
    const geometry = new Map<string, BufferGeometry>(names.map((n, i) => [n, loaded[i]]));
    geometry.forEach((g) => g.computeVertexNormals());

    const renderer = new three.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    const scene = new three.Scene();
    const camera = new three.PerspectiveCamera(32, 2, 0.05, 50);
    camera.up.set(0, 0, 1);
    scene.add(new three.HemisphereLight(0xdfe9ff, 0x1a1d3a, 2.2));
    const sun = new three.DirectionalLight(0xffffff, 2.4);
    sun.position.set(-1.5, -2, 4);
    scene.add(sun);

    const shell = new three.MeshStandardMaterial({ color: 0xd9dcea, roughness: 0.55, metalness: 0.15 });
    const limb = new three.MeshStandardMaterial({ color: 0x4a5080, roughness: 0.6, metalness: 0.3 });
    const parts = PARTS.map((part) => {
      if (!part) return null;
      const mesh = new three.Mesh(geometry.get(part.mesh), part.mesh === "torso" ? shell : limb);
      if (part.mirror) {
        mesh.scale.set(1, -1, 1);
        mesh.material = limb.clone();
        (mesh.material as import("three").MeshStandardMaterial).side = three.BackSide; // mirroring flips the winding
      }
      const holder = new three.Group();
      holder.add(mesh);
      scene.add(holder);
      return holder;
    });

    // WebGL lines are one pixel wide whatever you ask for, so the floor grid is a tiled texture instead.
    const cell = document.createElement("canvas");
    cell.width = cell.height = 128;
    const tiles = new three.CanvasTexture(cell);
    tiles.wrapS = tiles.wrapT = three.RepeatWrapping;
    tiles.repeat.set(48, 48); // 24 m across → half-metre cells
    tiles.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const grid = new three.Mesh(new three.PlaneGeometry(24, 24), new three.MeshBasicMaterial({ map: tiles, transparent: true, opacity: 0.3, depthWrite: false }));
    scene.add(grid);
    const shadow = new three.Mesh(new three.CircleGeometry(0.34, 40), new three.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
    shadow.scale.set(1, 0.55, 1);
    shadow.position.z = 0.002;
    scene.add(shadow);
    const view = new Lite3View(three, renderer, scene, camera, parts, grid, shadow, cell, tiles);
    view.retheme();
    return view;
  }

  render({ bodies, orientations }: Pose) {
    const canvas = this.renderer.domElement, w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * this.renderer.getPixelRatio()) || canvas.height !== Math.round(h * this.renderer.getPixelRatio())) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this.parts.forEach((part, id) => {
      if (!part) return;
      part.position.set(bodies[id * 3], bodies[id * 3 + 1], bodies[id * 3 + 2]);
      part.quaternion.set(orientations[id * 4 + 1], orientations[id * 4 + 2], orientations[id * 4 + 3], orientations[id * 4]); // MuJoCo is w-first
    });
    const x = bodies[3], y = bodies[4];
    this.shadow.position.x = x;
    this.shadow.position.y = y;
    const yaw = Math.atan2(2 * (orientations[4] * orientations[7] + orientations[5] * orientations[6]), 1 - 2 * (orientations[6] ** 2 + orientations[7] ** 2));
    this.shadow.rotation.z = yaw;
    // The grid is finite; slide it in whole cells so it looks endless without appearing to move.
    this.grid.position.set(Math.round(x * 2) / 2, Math.round(y * 2) / 2, 0);
    this.camera.position.set(x + 0.9, y - 1.7, 0.75);
    this.camera.lookAt(x, y, 0.22);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
  }
}
