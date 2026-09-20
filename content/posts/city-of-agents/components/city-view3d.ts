import type * as THREE from "three";
import { type Building, type City, hourOf, PARAMS, type Rect, sunAltitude, windowsLit } from "./sim";

type Three = typeof THREE;

/** Scene colours. These are materials of a little world with its own sky, not UI: the page's tokens colour the people. */
const C = {
  outskirts: 0x3d5a45, asphalt: 0x3a3d4a, pavement: 0xb9bcc6, stripe: 0xe8e8ee, river: 0x3f7fb5,
  lot: { residential: 0x7fa06a, commercial: 0x9a9eab, food: 0xb3a590, park: 0x5f9e57, riverside: 0xd6c79a },
  house: [0xd9b38c, 0xe6c9a8, 0xc98f6b, 0xd4a27a], office: [0x8fa3b8, 0x7b8da6, 0xa3b3c4, 0x6f8199], shop: [0xe9e2d0, 0xdfd3bd],
  awning: [0xff6e96, 0x79dafa, 0xb9a5ff, 0xffc46b], trunk: 0x6b4a32, crown: [0x4f8a4a, 0x5c9a52, 0x3f7a44], metal: 0x4a4e5c, bench: 0x8a6a45,
  glass: 0x27324a, lit: [0xffd98a, 0xffe9b8, 0xffc46b, 0xcfe6ff], lampOff: 0x5a5e6c, lampOn: 0xffd9a0,
  night: 0x070918, dusk: 0xf08a5d, day: 0x9ccff2, sunLow: 0xffb070, sunHigh: 0xfff4e0, moon: 0x8fa8ff,
};

const hash01 = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

type Box = { x: number; y: number; z: number; sx: number; sy: number; sz: number; color: number };

/**
 * The city as a handful of instanced meshes: every box (ground, blocks, zebra stripes, buildings, awnings, posts, benches)
 * is one draw call, tree crowns one, windows one, lamp heads and their pools of light one each. Light, sky, fog, lamps
 * and windows are functions of the simulated hour; the view keeps no state of its own about the time of day.
 */
export class CityView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  /** Draw calls of the last frame, shadow pass included. */
  calls = 0;
  orbit = 0.6;

  private readonly root: THREE.Group;
  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly fog: THREE.FogExp2;
  private readonly sky: THREE.Color;
  private readonly lampHeads: THREE.MeshBasicMaterial;
  private readonly lampPools: THREE.MeshBasicMaterial;
  private readonly windows: THREE.InstancedMesh | null = null;
  private readonly windowHash: Float32Array = new Float32Array(0);
  private readonly windowLit: Uint8Array = new Uint8Array(0);
  private windowStamp = -1;
  private readonly tmp: { a: THREE.Color; b: THREE.Color };
  private readonly lightDir: THREE.Vector3;
  private readonly disposables: { dispose(): void }[] = [];

  constructor(private readonly T: Three, readonly canvas: HTMLCanvasElement, readonly city: City) {
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    // three r186 folded PCFSoft into PCFShadowMap (asking for PCFSoft only logs a warning): this is the soft one.
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.scene = new T.Scene();
    this.sky = new T.Color(C.night);
    this.scene.background = this.sky;
    this.fog = new T.FogExp2(C.night, 0.35 / city.size);
    this.scene.fog = this.fog;
    this.camera = new T.PerspectiveCamera(32, 2, 1, city.size * 6);
    this.camera.up.set(0, 0, 1);
    this.tmp = { a: new T.Color(), b: new T.Color() };
    this.lightDir = new T.Vector3(0, 0, 1);

    this.hemi = new T.HemisphereLight(0xcfe3ff, 0x4a4a3a, 1);
    this.hemi.position.set(0, 0, 1);
    this.sun = new T.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    // City coordinates run 0…size; the scene is centred on the origin.
    this.root = new T.Group();
    this.root.position.set(-city.size / 2, -city.size / 2, 0);
    this.scene.add(this.root);

    const boxes: Box[] = [], crowns: [number, number, number][] = [], lamps: [number, number][] = [];
    this.collect(boxes, crowns, lamps);
    this.addBoxes(boxes);
    this.addCrowns(crowns);
    this.lampHeads = new T.MeshBasicMaterial({ color: C.lampOff });
    this.lampPools = new T.MeshBasicMaterial({ color: C.lampOn, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, fog: false });
    this.addLamps(lamps);
    const built = this.addWindows();
    if (built) { this.windows = built.mesh; this.windowHash = built.hash; this.windowLit = new Uint8Array(built.hash.length); }
    this.setTime(PARAMS.startMinute);
  }

  // ── building the scene ────────────────────────────────────────────────────

  private collect(boxes: Box[], crowns: [number, number, number][], lamps: [number, number][]): void {
    const { city } = this, P = PARAMS.pavementWidth, slab = (r: Rect, top: number, thick: number, color: number) => boxes.push({ x: r.x, y: r.y, z: top - thick / 2, sx: r.w, sy: r.d, sz: thick, color });
    slab({ x: city.size / 2, y: city.size / 2, w: city.size * 5, d: city.size * 5 }, -0.4, 1, C.outskirts);
    slab({ x: city.size / 2, y: city.size / 2, w: city.size, d: city.size }, 0, 1, C.asphalt);
    slab({ ...city.river, d: city.size * 5 }, -0.2, 1, C.river);
    for (const b of city.blocks) {
      slab(b.rect, 0.2, 0.6, C.pavement);
      slab({ ...b.rect, w: b.rect.w - 2 * P, d: b.rect.d - 2 * P }, 0.26, 0.6, C.lot[b.zone]);
    }
    for (const r of city.crosswalks) {
      const alongX = r.w > r.d, span = alongX ? r.w : r.d, count = Math.floor((span - P) / 1.3);
      for (let k = 0; k < count; k++) {
        const at = -(count - 1) * 0.65 + k * 1.3;
        boxes.push({ x: r.x + (alongX ? at : 0), y: r.y + (alongX ? 0 : at), z: 0.02, sx: alongX ? 0.65 : r.w * 0.85, sy: alongX ? r.d * 0.85 : 0.65, sz: 0.04, color: C.stripe });
      }
    }
    for (const b of city.buildings) {
      const palette = C[b.kind], { rect } = b;
      boxes.push({ x: rect.x, y: rect.y, z: 0.26 + b.height / 2, sx: rect.w, sy: rect.d, sz: b.height, color: palette[b.id % palette.length] });
      if (b.kind === "shop") {
        const [dx, dy] = this.facing(b);
        boxes.push({ x: rect.x + dx * (rect.w / 2 + 0.6), y: rect.y + dy * (rect.d / 2 + 0.6), z: 2.7, sx: dx ? 1.4 : rect.w * 0.9, sy: dy ? 1.4 : rect.d * 0.9, sz: 0.18, color: C.awning[b.id % C.awning.length] });
      }
    }
    city.props.forEach((p, i) => {
      if (p.kind === "lamp") { boxes.push({ x: p.x, y: p.y, z: 2.4, sx: 0.16, sy: 0.16, sz: 4.4, color: C.metal }); lamps.push([p.x, p.y]); }
      else if (p.kind === "bench") boxes.push({ x: p.x, y: p.y, z: 0.5, sx: 1.7, sy: 0.55, sz: 0.45, color: C.bench });
      else if (p.kind === "bin") boxes.push({ x: p.x, y: p.y, z: 0.65, sx: 0.5, sy: 0.5, sz: 0.85, color: C.metal });
      else { boxes.push({ x: p.x, y: p.y, z: 1.1, sx: 0.3, sy: 0.3, sz: 1.8, color: C.trunk }); crowns.push([p.x, p.y, 1.2 + hash01(i) * 0.7]); }
    });
  }

  /** Which way a building's door faces: towards its place on the pavement. */
  private facing(b: Building): [number, number] {
    const [px, py] = this.city.places[b.place].centre, dx = px - b.rect.x, dy = py - b.rect.y;
    return Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
  }

  private addBoxes(boxes: Box[]): void {
    const T = this.T, geometry = new T.BoxGeometry(1, 1, 1), material = new T.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
    const mesh = new T.InstancedMesh(geometry, material, boxes.length), m = new T.Matrix4(), color = new T.Color();
    boxes.forEach((b, i) => { m.makeScale(b.sx, b.sy, b.sz).setPosition(b.x, b.y, b.z); mesh.setMatrixAt(i, m); mesh.setColorAt(i, color.setHex(b.color)); });
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    this.root.add(mesh);
    this.disposables.push(geometry, material, mesh);
  }

  private addCrowns(crowns: [number, number, number][]): void {
    if (!crowns.length) return;
    const T = this.T, geometry = new T.IcosahedronGeometry(1, 0), material = new T.MeshStandardMaterial({ roughness: 1, flatShading: true });
    const mesh = new T.InstancedMesh(geometry, material, crowns.length), m = new T.Matrix4(), color = new T.Color();
    crowns.forEach(([x, y, r], i) => { m.makeScale(r, r, r * 1.25).setPosition(x, y, 2 + r); mesh.setMatrixAt(i, m); mesh.setColorAt(i, color.setHex(C.crown[i % C.crown.length])); });
    mesh.castShadow = true; mesh.frustumCulled = false;
    this.root.add(mesh);
    this.disposables.push(geometry, material, mesh);
  }

  private addLamps(lamps: [number, number][]): void {
    const T = this.T, m = new T.Matrix4(), head = new T.BoxGeometry(0.5, 0.5, 0.3), pool = new T.CircleGeometry(3, 20);
    const heads = new T.InstancedMesh(head, this.lampHeads, lamps.length), pools = new T.InstancedMesh(pool, this.lampPools, lamps.length);
    lamps.forEach(([x, y], i) => { heads.setMatrixAt(i, m.makeTranslation(x, y, 4.7)); pools.setMatrixAt(i, m.makeTranslation(x, y, 0.3)); });
    heads.frustumCulled = false; pools.frustumCulled = false;
    this.root.add(heads, pools);
    this.disposables.push(head, pool, heads, pools, this.lampHeads, this.lampPools);
  }

  /** One quad per window, up to six across and twenty-four floors up on each face. */
  private addWindows(): { mesh: THREE.InstancedMesh; hash: Float32Array } | null {
    const T = this.T, panes: { m: THREE.Matrix4; hash: number }[] = [], right = new T.Vector3(), up = new T.Vector3(0, 0, 1), normal = new T.Vector3();
    for (const b of this.city.buildings) {
      const { rect } = b, shop = b.kind === "shop", floors = shop ? 1 : Math.min(24, Math.floor((b.height - 1) / 3.2)), bHash = hash01(b.id + 0.5);
      for (const [nx, ny] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const width = nx ? rect.d : rect.w, cols = shop ? 1 : Math.min(6, Math.max(1, Math.floor(width / 2.6))), cell = width / cols;
        normal.set(nx, ny, 0); right.set(-ny, nx, 0);
        for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
          const along = (c + 0.5) * cell - width / 2, w = shop ? width * 0.8 : cell * 0.55, h = shop ? 1.6 : 1.5, z = 0.26 + (shop ? 1.3 : 2 + f * 3.2);
          const m = new T.Matrix4().makeBasis(right.clone().multiplyScalar(w), up.clone().multiplyScalar(h), normal);
          m.setPosition(rect.x + nx * (rect.w / 2 + 0.03) - ny * along, rect.y + ny * (rect.d / 2 + 0.03) + nx * along, z);
          // Most of a building's windows follow the building; each is a little early or late, and a quarter never come on.
          const own = hash01(panes.length * 1.37 + b.id);
          panes.push({ m, hash: own < 0.25 ? -1 : Math.min(0.999, bHash * 0.75 + own * 0.25) });
        }
      }
    }
    if (!panes.length) return null;
    const geometry = new T.PlaneGeometry(1, 1), material = new T.MeshBasicMaterial(), mesh = new T.InstancedMesh(geometry, material, panes.length), glass = new T.Color(C.glass);
    panes.forEach((p, i) => { mesh.setMatrixAt(i, p.m); mesh.setColorAt(i, glass); });
    mesh.frustumCulled = false;
    this.root.add(mesh);
    this.disposables.push(geometry, material, mesh);
    return { mesh, hash: Float32Array.from(panes, (p) => p.hash) };
  }

  // ── time of day ───────────────────────────────────────────────────────────

  /** Everything the hour decides: where the light comes from and how strong, sky and fog, lamps, windows. */
  setTime(t: number): void {
    const { a, b } = this.tmp, hour = hourOf(t), alt = sunAltitude(hour), theta = ((hour - 6) / 24) * 2 * Math.PI, day = smooth(alt / 0.25 + 0.2), side = alt >= 0 ? 1 : -1;
    // One light is the sun by day and the moon by night; it fades through zero at the horizon, so the swap is never seen.
    this.lightDir.set(Math.cos(theta) * side, -0.45 * side, Math.sin(theta) * side).normalize();
    this.sun.color.copy(alt >= 0 ? a.setHex(C.sunLow).lerp(b.setHex(C.sunHigh), smooth(alt * 2)) : a.setHex(C.moon));
    this.sun.intensity = alt >= 0 ? 2.6 * smooth(alt / 0.15) : 0.7 * smooth(-alt / 0.15);
    this.hemi.intensity = 0.5 + 0.7 * day;
    const dusk = Math.max(0, 1 - Math.abs(alt) / 0.3);
    this.sky.setHex(C.night).lerp(a.setHex(C.day), day).lerp(b.setHex(C.dusk), dusk * 0.55);
    this.fog.color.copy(this.sky);
    const lampsOn = smooth(-alt / 0.08 + 0.5);
    this.lampHeads.color.setHex(C.lampOff).lerp(a.setHex(C.lampOn), lampsOn);
    this.lampPools.opacity = 0.16 * lampsOn;
    this.updateWindows(t, hour);
  }

  /** Windows only change every few simulated minutes, and only the ones that flipped are rewritten. */
  private updateWindows(t: number, hour: number): void {
    const stamp = Math.floor(t / 5);
    if (!this.windows || stamp === this.windowStamp) return;
    this.windowStamp = stamp;
    const { a } = this.tmp;
    let changed = false;
    for (let i = 0; i < this.windowHash.length; i++) {
      const lit = this.windowHash[i] >= 0 && windowsLit(hour, this.windowHash[i]) ? 1 : 0;
      if (lit === this.windowLit[i]) continue;
      this.windowLit[i] = lit; changed = true;
      this.windows.setColorAt(i, a.setHex(lit ? C.lit[i % C.lit.length] : C.glass));
    }
    if (changed && this.windows.instanceColor) this.windows.instanceColor.needsUpdate = true;
  }

  // ── camera and frame ──────────────────────────────────────────────────────

  /** `dt` in real seconds; `orbiting` false holds the camera still (reduced motion). */
  render(dt: number, orbiting: boolean): void {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight, ratio = this.renderer.getPixelRatio();
    if (!w || !h) return;
    if (this.canvas.width !== Math.round(w * ratio) || this.canvas.height !== Math.round(h * ratio)) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    if (orbiting) this.orbit += dt * 0.04;
    // 45° down on the whole city; a narrow canvas stands further back so the city still fits.
    const distance = this.city.size * 1.5 * Math.max(1, 1.2 / this.camera.aspect), flat = distance * Math.SQRT1_2;
    this.camera.position.set(Math.cos(this.orbit) * flat, Math.sin(this.orbit) * flat, flat);
    this.camera.lookAt(0, 0, 0);
    this.aimLight(0, 0, this.city.size * 0.75);
    this.renderer.render(this.scene, this.camera);
    this.calls = this.renderer.info.render.calls;
  }

  /** The shadow map covers `reach` around the point being looked at, not the whole map. */
  private aimLight(x: number, y: number, reach: number): void {
    const d = this.lightDir, far = reach * 3, cam = this.sun.shadow.camera;
    this.sun.target.position.set(x, y, 0);
    this.sun.position.set(x + d.x * far * 0.5, y + d.y * far * 0.5, d.z * far * 0.5);
    if (cam.right !== reach) { cam.left = -reach; cam.right = reach; cam.top = reach; cam.bottom = -reach; cam.near = 1; cam.far = far; cam.updateProjectionMatrix(); }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
  }
}
