import type * as THREE from "three";
import { type Action, type Building, type City, hourOf, PARAMS, type Rect, sunAltitude, windowsLit } from "./sim";

type Three = typeof import("@/lib/three");

/** Scene colours. These are materials of a little world with its own sky, not UI: the page's tokens colour the people. */
const C = {
  plinth: 0x232836, verge: 0x4f6e52, asphalt: 0x3b3f4c, pavement: 0xc4c7cf, stripe: 0xeeeef2, laneLine: 0xd9d6cc, centreLine: 0xe8b85a, river: 0x2f6f9f,
  lot: { residential: 0x86a570, commercial: 0xa3a7b2, food: 0xb8ab96, park: 0x62a05a, riverside: 0xd8c99e },
  path: 0xd9ceb0,
  house: [0xecd8bd, 0xdcbd9d, 0xf2e5d3, 0xcfa98a, 0xe3cbb3], roof: [0xa65d48, 0x8c5344, 0x5d6470, 0x6e5247, 0xb8715a, 0x4f5866],
  office: [0xa4b4c6, 0x8797ac, 0xbcc7d3, 0x71819a, 0xcad0d8], podium: 0x7f8796, shop: [0xeee7d6, 0xe2d6c0],
  awning: [0xff6e96, 0x79dafa, 0xb9a5ff, 0xffc46b], trunk: 0x6b4a32, crown: [0x4f8a4a, 0x5f9d52, 0x3f7a44, 0x6aa65a, 0x467f3f], metal: 0x4a4e5c, bench: 0x8a6a45,
  lit: [0xffd68a, 0xffe6b0, 0xffc466, 0xd6e8ff], lampOff: 0x5a5e6c, lampOn: 0xffd9a0,
  sky: { dayZenith: 0x4f8fd6, dayHorizon: 0xd6e8f3, duskZenith: 0x3f4f8c, duskHorizon: 0xf29a6a, nightZenith: 0x03050d, nightHorizon: 0x18203d },
  glass: { nightLow: 0x0a0f1d, nightHigh: 0x172036, dayLow: 0x3a4d68 },
  sunLow: 0xffb070, sunHigh: 0xfff4e0, moon: 0x8fa8ff, hemiDay: 0xdce9ff, hemiNight: 0x5b6a9c,
};

/** People are drawn about twice life size: at the distance the whole city is seen from, life size is two pixels. */
const PERSON = 2.2;
/** Top of a block's lot, which buildings stand on. */
const LOT = 0.26;
/** Green belt between the city and the edge of the model. */
const MARGIN = 14;
/** Houses up to this tall get a pitched roof; taller ones are flat-roofed flats. */
const PITCHED = 10;
/** Offices from this tall stand on a podium; from `CROWN` up they end in a set-back crown. */
const PODIUM = 28, CROWN = 45;
export type PeopleColors = Record<Action | "idle", string>;
/**
 * What the view needs to draw everyone: positions now and one tick ago, which way they face, what they are up to, and
 * `at`, the place where they are doing it (−1 unless they are doing something).
 */
export type PeopleFrame = { count: number; x: Float64Array; y: Float64Array; px: Float64Array; py: Float64Array; heading: Float64Array; action: (Action | null)[]; walking: Uint8Array; at: Int32Array };

const hash01 = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

type Box = { x: number; y: number; z: number; sx: number; sy: number; sz: number; color: number };

/** The sky: a gradient from the zenith to the horizon and on down to a darker ground, a sunset band, and a glow where the sun is. */
const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uDusk; uniform float uDuskAmount;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  vec3 c = d.z > 0.0 ? mix(uHorizon, uZenith, pow(smoothstep(0.0, 1.0, d.z), 0.55)) : mix(uHorizon, uGround, smoothstep(0.0, 0.9, -d.z));
  // Dawn and dusk colour a band along the horizon, strongest towards the sun.
  float toward = max(dot(normalize(d.xy + 1e-5), normalize(uSunDir.xy + 1e-5)), 0.0);
  c = mix(c, uDusk, uDuskAmount * exp(-abs(d.z) * 5.0) * (0.2 + 0.8 * toward * toward));
  float s = max(dot(d, uSunDir), 0.0);
  c += uSunColor * (pow(s, 900.0) * 2.0 + pow(s, 12.0) * 0.18) * smoothstep(-0.05, 0.02, d.z);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * The figure's pose, per vertex: legs swing opposite each other and the arms opposite the legs, by how much the person
 * is walking; while talking the right arm gestures and the head nods. `aAnim` is per person: stride phase, walking
 * (0–1), talking (0 silent, 0.4 listening, 1 speaking), and a number that picks their skin, hair and trousers.
 */
const FIGURE_VERTEX = /* glsl */ `
attribute float aPart; attribute vec3 aJoint; attribute vec4 aAnim;
uniform float uTime;
varying float vPart; varying float vLook;
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }
float figureAngle() {
  float swing = sin(aAnim.x * 3.14159), walk = aAnim.y, talk = aAnim.z, look = aAnim.w, kind = aJoint.x, side = aJoint.y;
  float speak = smoothstep(0.6, 1.0, talk), listen = step(0.2, talk);
  if (kind == 1.0) return side * swing * 0.6 * walk;
  if (kind == 2.0) return -side * swing * 0.5 * walk - (side > 0.0 ? speak * (1.0 + 0.35 * sin(uTime * 7.0 + look * 20.0)) : speak * 0.15 * sin(uTime * 4.0 + look * 9.0));
  if (kind == 3.0) return listen * (speak > 0.5 ? 0.06 : 0.14) * sin(uTime * (speak > 0.5 ? 3.0 : 5.0) + look * 13.0);
  return 0.0;
}`;
/** Parts: 0 shirt (the activity's colour), 1 skin, 2 trousers, 3 hair, 4 shoes. Colours are linear. */
const FIGURE_FRAGMENT = /* glsl */ `
uniform float uGlow;
varying float vPart; varying float vLook;
vec3 figureColor(vec3 shirt) {
  if (vPart < 0.5) return shirt;
  if (vPart < 1.5) return mix(vec3(0.9, 0.64, 0.5), vec3(0.34, 0.18, 0.1), pow(fract(vLook * 7.31), 1.8));
  if (vPart < 2.5) return mix(vec3(0.02, 0.025, 0.05), vec3(0.2, 0.18, 0.15), fract(vLook * 5.13));
  if (vPart < 3.5) { float h = fract(vLook * 3.77); return h < 0.45 ? vec3(0.01, 0.008, 0.007) : h < 0.75 ? vec3(0.09, 0.04, 0.02) : h < 0.9 ? vec3(0.3, 0.16, 0.06) : vec3(0.45, 0.43, 0.4); }
  return vec3(0.02);
}`;

/**
 * The city as a handful of instanced meshes: every box (plinth, ground, blocks, road markings, buildings, awnings, posts,
 * benches) is one draw call; roofs, tree crowns, windows, lamp heads, pools of lamplight and the soft shadows on the
 * ground one each; people three. Light, sky, fog, lamps and windows are functions of the simulated hour; the view keeps no
 * state of its own about the time of day.
 */
export class CityView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  /** Draw calls of the last frame, shadow pass included. */
  calls = 0;
  orbit = 0.6;
  /** The person the camera follows, or −1 for the view of the whole city. */
  follow = -1;

  private readonly root: THREE.Group;
  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly fog: THREE.FogExp2;
  private readonly sky: THREE.Color;
  private readonly dome: THREE.Mesh;
  private readonly skyUniforms: { uZenith: { value: THREE.Color }; uHorizon: { value: THREE.Color }; uGround: { value: THREE.Color }; uSunDir: { value: THREE.Vector3 }; uSunColor: { value: THREE.Color }; uDusk: { value: THREE.Color }; uDuskAmount: { value: number } };
  private readonly glassUniforms: { uGlassLow: { value: THREE.Color }; uGlassHigh: { value: THREE.Color } };
  private readonly lampHeads: THREE.MeshBasicMaterial;
  private readonly lampPools: THREE.MeshBasicMaterial;
  private readonly windows: THREE.InstancedMesh | null = null;
  private boxMesh: THREE.InstancedMesh | null = null;
  private roofMesh: THREE.InstancedMesh | null = null;
  /**
   * For the cutaway: each building's body among the boxes, the other boxes that belong to it (podium, crown, parapet,
   * awning, plant on the roof), its roof, its windows among the panes, and how far it is lowered (1 = standing).
   */
  private readonly bodyOf: number[] = [];
  private readonly partsOf: number[][] = [];
  private readonly roofOf: number[] = [];
  private readonly boxes: Box[] = [];
  private readonly roofMatrices: THREE.Matrix4[] = [];
  private readonly panesOf: [number, number][] = [];
  private paneMatrices: THREE.Matrix4[] = [];
  private stand: Float32Array = new Float32Array(0);
  private readonly windowHash: Float32Array = new Float32Array(0);
  private readonly windowLit: Uint8Array = new Uint8Array(0);
  private windowStamp = -1;
  private people: {
    bodies: THREE.InstancedMesh; blobs: THREE.InstancedMesh; bubbles: THREE.InstancedMesh; anim: THREE.InstancedBufferAttribute; colors: Record<string, THREE.Color>; shown: (string | null)[];
    stride: Float32Array; walk: Float32Array; inside: Float32Array; door: Float32Array; heading: Float32Array; turned: Uint8Array;
    talk: Float32Array; speak: Float32Array; partner: Int32Array; ox: Float32Array; oy: Float32Array; lastX: Float32Array; lastY: Float32Array; paired: number;
  } | null = null;
  private lastPeople = 0;
  /** How far the camera stood from what it looked at, last frame. */
  private viewDistance = 0;
  /** Where each place's door is, for the places that are buildings; parks and the riverside have none. */
  private readonly doorAt: ([number, number] | undefined)[] = [];
  private readonly figureUniforms: { uTime: { value: number }; uGlow: { value: number } };
  private readonly softShadow: THREE.CanvasTexture;
  private readonly tmp: { a: THREE.Color; b: THREE.Color; c: THREE.Color };
  private readonly lightDir: THREE.Vector3;
  private readonly up: THREE.Vector3;
  private readonly origin: THREE.Vector3;
  private readonly followAt: THREE.Vector3;
  private readonly lookAt: THREE.Vector3;
  private readonly cameraAt: THREE.Vector3;
  private eased = false;
  private readonly personMatrix: THREE.Matrix4;
  private readonly personTurn: THREE.Quaternion;
  private readonly personScale: THREE.Vector3;
  private readonly personAt: THREE.Vector3;
  private readonly blobTurn: THREE.Quaternion;
  private readonly blobScale: THREE.Vector3;
  private readonly bubbleScale: THREE.Vector3;
  private readonly leanAxis: THREE.Vector3;
  private readonly leanNow: THREE.Quaternion;
  private readonly disposables: { dispose(): void }[] = [];

  constructor(private readonly T: Three, readonly canvas: HTMLCanvasElement, readonly city: City) {
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    // Khronos' neutral tone mapping rolls off the highlights and leaves the palette's own colours alone.
    this.renderer.toneMapping = T.NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    // three r186 folded PCFSoft into PCFShadowMap (asking for PCFSoft only logs a warning): this is the soft one.
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.scene = new T.Scene();
    this.sky = new T.Color(C.sky.nightHorizon);
    this.scene.background = this.sky;
    this.fog = new T.FogExp2(C.sky.nightHorizon, 0.24 / city.size);
    this.scene.fog = this.fog;
    this.camera = new T.PerspectiveCamera(32, 2, 1, city.size * 6);
    this.camera.up.set(0, 0, 1);
    this.tmp = { a: new T.Color(), b: new T.Color(), c: new T.Color() };
    this.lightDir = new T.Vector3(0, 0, 1);
    this.up = new T.Vector3(0, 0, 1);
    this.origin = new T.Vector3(); this.followAt = new T.Vector3(); this.lookAt = new T.Vector3(); this.cameraAt = new T.Vector3();
    this.personMatrix = new T.Matrix4(); this.personTurn = new T.Quaternion(); this.personAt = new T.Vector3();
    this.personScale = new T.Vector3(PERSON, PERSON, PERSON);
    this.blobTurn = new T.Quaternion(); this.blobScale = new T.Vector3(1.5 * PERSON, 1.5 * PERSON, 1); this.bubbleScale = new T.Vector3();
    this.leanAxis = new T.Vector3(0, 1, 0); this.leanNow = new T.Quaternion();
    this.figureUniforms = { uTime: { value: 0 }, uGlow: { value: 0.2 } };

    this.hemi = new T.HemisphereLight(C.hemiDay, 0x3f3f34, 1);
    this.hemi.position.set(0, 0, 1);
    this.sun = new T.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    // The sky is a dome that travels with the camera, drawn first and behind everything.
    this.skyUniforms = { uZenith: { value: new T.Color() }, uHorizon: { value: new T.Color() }, uGround: { value: new T.Color() }, uSunDir: { value: new T.Vector3(0, 0, 1) }, uSunColor: { value: new T.Color() }, uDusk: { value: new T.Color(C.sky.duskHorizon) }, uDuskAmount: { value: 0 } };
    const domeGeometry = new T.SphereGeometry(city.size * 2.5, 32, 16), domeMaterial = new T.ShaderMaterial({ uniforms: this.skyUniforms, vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT, side: T.BackSide, depthWrite: false, fog: false });
    this.dome = new T.Mesh(domeGeometry, domeMaterial);
    this.dome.renderOrder = -1; this.dome.frustumCulled = false;
    this.scene.add(this.dome);
    this.disposables.push(domeGeometry, domeMaterial);

    // City coordinates run 0…size; the scene is centred on the origin.
    this.root = new T.Group();
    this.root.position.set(-city.size / 2, -city.size / 2, 0);
    this.scene.add(this.root);

    this.softShadow = this.makeSoftShadow();
    this.disposables.push(this.softShadow);
    this.glassUniforms = { uGlassLow: { value: new T.Color(C.glass.nightLow) }, uGlassHigh: { value: new T.Color(C.glass.nightHigh) } };

    const boxes: Box[] = [], roofs: THREE.Matrix4[] = [], roofColors: number[] = [], crowns: [number, number, number, number][] = [], lamps: [number, number][] = [], shadows: THREE.Matrix4[] = [];
    this.collect(boxes, roofs, roofColors, crowns, lamps, shadows);
    this.addBoxes(boxes);
    this.addRoofs(roofs, roofColors);
    this.addCrowns(crowns);
    this.addShadows(shadows);
    this.addRiver();
    this.lampHeads = new T.MeshBasicMaterial({ color: C.lampOff, toneMapped: false });
    this.lampPools = new T.MeshBasicMaterial({ color: C.lampOn, map: this.makeGlow(), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, fog: false, toneMapped: false });
    this.addLamps(lamps);
    const built = this.addWindows();
    if (built) { this.windows = built.mesh; this.windowHash = built.hash; this.windowLit = new Uint8Array(built.hash.length); }
    this.setTime(PARAMS.startMinute);
  }

  // ── building the scene ────────────────────────────────────────────────────

  private collect(boxes: Box[], roofs: THREE.Matrix4[], roofColors: number[], crowns: [number, number, number, number][], lamps: [number, number][], shadows: THREE.Matrix4[]): void {
    const T = this.T, { city } = this, P = PARAMS.pavementWidth, S = city.size, river = city.river;
    const slab = (r: Rect, top: number, thick: number, color: number) => boxes.push({ x: r.x, y: r.y, z: top - thick / 2, sx: r.w, sy: r.d, sz: thick, color }) - 1;
    const shadow = (x: number, y: number, w: number, d: number, z = LOT + 0.02) => shadows.push(new T.Matrix4().makeScale(w, d, 1).setPosition(x, y, z));

    // The model: a dark plinth, a green belt round the city, the river cut into it along the east side.
    const west = -MARGIN, east = river.x + river.w / 2 + MARGIN, south = -MARGIN, north = S + MARGIN, mid = (south + north) / 2, span = north - south;
    slab({ x: (west + east) / 2, y: mid, w: east - west, d: span }, -1, 7, C.plinth);
    slab({ x: west / 2, y: mid, w: -west, d: span }, -0.1, 0.9, C.verge);
    slab({ x: (river.x + river.w / 2 + east) / 2, y: mid, w: MARGIN, d: span }, -0.1, 0.9, C.verge);
    slab({ x: S / 2, y: -MARGIN / 2, w: S, d: MARGIN }, -0.1, 0.9, C.verge);
    slab({ x: S / 2, y: S + MARGIN / 2, w: S, d: MARGIN }, -0.1, 0.9, C.verge);
    slab({ x: river.x, y: mid, w: river.w, d: span }, -0.62, 0.4, this.shade(C.river, 0.55));
    slab({ x: S / 2, y: S / 2, w: S, d: S }, 0, 1, C.asphalt);

    for (const b of city.blocks) {
      slab(b.rect, 0.2, 0.6, C.pavement);
      const inner = { ...b.rect, w: b.rect.w - 2 * P, d: b.rect.d - 2 * P };
      slab(inner, LOT, 0.6, C.lot[b.zone]);
      // Parks get two paths crossing in the middle.
      if (b.zone === "park") { slab({ ...inner, w: 2.2 }, LOT + 0.02, 0.6, C.path); slab({ ...inner, d: 2.2 }, LOT + 0.02, 0.6, C.path); }
    }
    for (const r of city.crosswalks) {
      const alongX = r.w > r.d, span = alongX ? r.w : r.d, count = Math.floor((span - P) / 1.3);
      for (let k = 0; k < count; k++) {
        const at = -(count - 1) * 0.65 + k * 1.3;
        boxes.push({ x: r.x + (alongX ? at : 0), y: r.y + (alongX ? 0 : at), z: 0.02, sx: alongX ? 0.65 : r.w * 0.85, sy: alongX ? r.d * 0.85 : 0.65, sz: 0.04, color: C.stripe });
      }
    }
    this.markings(boxes);

    for (const b of city.buildings) {
      const { rect } = b, id = b.id, parts: number[] = [], color = C[b.kind][id % C[b.kind].length];
      this.roofOf[id] = -1; this.partsOf[id] = parts;
      const part = (box: Box) => parts.push(boxes.push(box) - 1);
      const cap = (r: Rect, top: number, c: number) => part({ x: r.x, y: r.y, z: top + 0.3, sx: r.w + 0.4, sy: r.d + 0.4, sz: 0.6, color: this.shade(c, 0.78) });
      if (b.kind === "office" && b.height >= PODIUM) {
        // A podium two floors high over the whole lot, the tower set back on it, and on the tallest a crown set back again.
        const tower = { ...rect, w: rect.w * 0.82, d: rect.d * 0.82 }, podium = 7;
        part({ x: rect.x, y: rect.y, z: LOT + podium / 2, sx: rect.w + 0.6, sy: rect.d + 0.6, sz: podium, color: C.podium });
        this.bodyOf[id] = boxes.push({ x: rect.x, y: rect.y, z: LOT + b.height / 2, sx: tower.w, sy: tower.d, sz: b.height, color }) - 1;
        const top = LOT + b.height;
        if (b.height >= CROWN) {
          const crown = 3 + hash01(id) * 3;
          part({ x: rect.x, y: rect.y, z: top + crown / 2, sx: tower.w * 0.62, sy: tower.d * 0.62, sz: crown, color: this.shade(color, 0.9) });
          cap({ ...tower, w: tower.w * 0.62, d: tower.d * 0.62 }, top + crown, color);
        } else cap(tower, top, color);
        this.plant(part, tower, top, id);
        shadow(rect.x, rect.y, rect.w + 7, rect.d + 7);
      } else {
        this.bodyOf[id] = boxes.push({ x: rect.x, y: rect.y, z: LOT + b.height / 2, sx: rect.w, sy: rect.d, sz: b.height, color }) - 1;
        const top = LOT + b.height;
        if (b.kind === "house" && b.height < PITCHED) {
          // A gable roof, ridge one way or the other, eaves over the walls.
          const turn = hash01(id * 3.1) < 0.5, pitch = Math.min(rect.w, rect.d) * 0.42, m = new T.Matrix4().makeScale(rect.w + 0.8, rect.d + 0.8, pitch);
          if (turn) m.premultiply(new T.Matrix4().makeRotationZ(Math.PI / 2));
          m.setPosition(rect.x, rect.y, top);
          this.roofOf[id] = roofs.push(m) - 1; roofColors.push(C.roof[Math.floor(hash01(id * 7.7) * C.roof.length)]);
        } else {
          cap(rect, top, color);
          if (b.kind !== "shop") this.plant(part, rect, top, id);
        }
        if (b.kind === "shop") {
          const [dx, dy] = this.facing(b);
          part({ x: rect.x + dx * (rect.w / 2 + 0.6), y: rect.y + dy * (rect.d / 2 + 0.6), z: 2.7, sx: dx ? 1.4 : rect.w * 0.9, sy: dy ? 1.4 : rect.d * 0.9, sz: 0.18, color: C.awning[id % C.awning.length] });
        }
        shadow(rect.x, rect.y, rect.w + (b.height > 20 ? 6 : 3.5), rect.d + (b.height > 20 ? 6 : 3.5));
      }
    }
    // A door on every building, on the side that faces its spot on the pavement: where people go in and come out.
    for (const b of city.buildings) {
      const { rect } = b, [dx, dy] = this.facing(b), podium = b.kind === "office" && b.height >= PODIUM ? 0.3 : 0, out = (dx ? rect.w : rect.d) / 2 + podium;
      const wide = b.kind === "shop" ? 2.4 : b.kind === "office" ? 2.2 : 1.3, high = b.kind === "house" ? 2.2 : 2.8;
      this.partsOf[b.id].push(boxes.push({ x: rect.x + dx * (out + 0.06), y: rect.y + dy * (out + 0.06), z: LOT + high / 2, sx: dx ? 0.14 : wide, sy: dy ? 0.14 : wide, sz: high, color: b.kind === "house" ? 0x5a3d2b : 0x1d2433 }) - 1);
      this.doorAt[b.place] = [rect.x + dx * (out + 0.3), rect.y + dy * (out + 0.3)];
    }
    city.props.forEach((p, i) => {
      if (p.kind === "lamp") { boxes.push({ x: p.x, y: p.y, z: 2.4, sx: 0.16, sy: 0.16, sz: 4.4, color: C.metal }); lamps.push([p.x, p.y]); }
      else if (p.kind === "bench") boxes.push({ x: p.x, y: p.y, z: 0.5, sx: 1.7, sy: 0.55, sz: 0.45, color: C.bench });
      else if (p.kind === "bin") boxes.push({ x: p.x, y: p.y, z: 0.65, sx: 0.5, sy: 0.5, sz: 0.85, color: C.metal });
      else {
        const r = 1.2 + hash01(i) * 0.7;
        boxes.push({ x: p.x, y: p.y, z: 1.1, sx: 0.3, sy: 0.3, sz: 1.8, color: C.trunk });
        crowns.push([p.x, p.y, 2 + r, r]);
        // Every other tree carries a smaller second crown, off to one side and higher up.
        if (hash01(i * 5.3) < 0.5) { const a = hash01(i * 9.1) * Math.PI * 2; crowns.push([p.x + Math.cos(a) * r * 0.5, p.y + Math.sin(a) * r * 0.5, 2 + r * 1.9, r * 0.6]); }
        shadow(p.x, p.y, r * 3.2, r * 3.2, 0.3);
      }
    });
  }

  /** Lane markings between the junctions: a double centre line on the avenues, a dashed one on the streets. */
  private markings(boxes: Box[]): void {
    const { city } = this, P = PARAMS.pavementWidth, B = PARAMS.blockSize, stretches = city.blocks.filter((b) => b.i === 0).map((b) => [b.rect.y - B / 2 + P + 0.5, b.rect.y + B / 2 - P - 0.5]);
    const line = (vertical: boolean, c: number, from: number, to: number, offset: number, color: number) => {
      const along = (from + to) / 2, length = to - from;
      boxes.push({ x: vertical ? c + offset : along, y: vertical ? along : c + offset, z: 0.015, sx: vertical ? 0.22 : length, sy: vertical ? length : 0.22, sz: 0.03, color });
    };
    for (const road of city.roads) {
      const c = road.vertical ? road.rect.x : road.rect.y;
      for (const [from, to] of stretches) {
        if (road.arterial) { line(road.vertical, c, from, to, -0.22, C.centreLine); line(road.vertical, c, from, to, 0.22, C.centreLine); }
        else for (let s = from; s + 2.4 <= to; s += 5) line(road.vertical, c, s, s + 2.4, 0, C.laneLine);
      }
    }
  }

  /** Plant on a flat roof: a box or two of machinery, never over the edge. */
  private plant(part: (box: Box) => number, r: Rect, top: number, id: number): void {
    const n = 1 + Math.floor(hash01(id * 2.3) * 2);
    for (let k = 0; k < n; k++) {
      const w = r.w * (0.18 + hash01(id + k * 4.1) * 0.14), d = r.d * (0.18 + hash01(id + k * 6.7) * 0.14), h = 1.2 + hash01(id + k * 8.9) * 1.8;
      const x = r.x + (hash01(id + k * 3.3) - 0.5) * (r.w - w - 1.5), y = r.y + (hash01(id + k * 5.9) - 0.5) * (r.d - d - 1.5);
      part({ x, y, z: top + 0.6 + h / 2, sx: w, sy: d, sz: h, color: 0x8b909c });
    }
  }

  private shade(hex: number, k: number): number { return this.tmp.c.setHex(hex).multiplyScalar(k).getHex(); }

  /** Which way a building's door faces: towards its place on the pavement. */
  private facing(b: Building): [number, number] {
    const [px, py] = this.city.places[b.place].centre, dx = px - b.rect.x, dy = py - b.rect.y;
    return Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
  }

  /**
   * Every box in one draw call. Walls darken towards the ground over the first few metres, the way light is blocked
   * where a wall meets the street: ambient occlusion by height, worked out in the shader instead of by a pass.
   */
  private addBoxes(boxes: Box[]): void {
    const T = this.T, geometry = new T.BoxGeometry(1, 1, 1), material = new T.MeshStandardMaterial({ roughness: 0.86, metalness: 0 });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying float vAoZ;\nvarying float vAoSide;").replace("#include <project_vertex>", [
        "#include <project_vertex>",
        "vec4 aoAt = vec4(transformed, 1.0);",
        "#ifdef USE_INSTANCING\naoAt = instanceMatrix * aoAt;\n#endif",
        "vAoZ = (modelMatrix * aoAt).z;",
        "vAoSide = 1.0 - abs(objectNormal.z);",
      ].join("\n"));
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vAoZ;\nvarying float vAoSide;").replace("#include <color_fragment>",
        "#include <color_fragment>\ndiffuseColor.rgb *= mix(1.0, mix(0.5, 1.0, smoothstep(0.2, 4.0, vAoZ)), vAoSide);");
    };
    const mesh = new T.InstancedMesh(geometry, material, boxes.length), m = new T.Matrix4(), color = new T.Color();
    boxes.forEach((b, i) => { m.makeScale(b.sx, b.sy, b.sz).setPosition(b.x, b.y, b.z); mesh.setMatrixAt(i, m); mesh.setColorAt(i, color.setHex(b.color)); });
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    this.root.add(mesh);
    this.disposables.push(geometry, material, mesh);
    this.boxMesh = mesh; this.boxes.push(...boxes); this.stand = new Float32Array(this.city.buildings.length).fill(1);
  }

  /** A unit gable roof: base 1 × 1 at z = 0, ridge along x at z = 1. */
  private addRoofs(roofs: THREE.Matrix4[], colors: number[]): void {
    if (!roofs.length) return;
    const T = this.T, a = [-0.5, -0.5, 0], b = [0.5, -0.5, 0], c = [0.5, 0.5, 0], d = [-0.5, 0.5, 0], e = [-0.5, 0, 1], f = [0.5, 0, 1];
    const faces = [a, b, f, a, f, e, c, d, e, c, e, f, d, a, e, b, c, f];
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.BufferAttribute(new Float32Array(faces.flat()), 3));
    geometry.computeVertexNormals();
    const material = new T.MeshStandardMaterial({ roughness: 0.8 }), mesh = new T.InstancedMesh(geometry, material, roofs.length), color = new T.Color();
    roofs.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, color.setHex(colors[i])); });
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    this.root.add(mesh);
    this.disposables.push(geometry, material, mesh);
    this.roofMesh = mesh; this.roofMatrices.push(...roofs);
  }

  private addCrowns(crowns: [number, number, number, number][]): void {
    if (!crowns.length) return;
    const T = this.T, geometry = new T.IcosahedronGeometry(1, 1), material = new T.MeshStandardMaterial({ roughness: 0.95, flatShading: true });
    const mesh = new T.InstancedMesh(geometry, material, crowns.length), m = new T.Matrix4(), color = new T.Color();
    crowns.forEach(([x, y, z, r], i) => { m.makeScale(r, r, r * 1.15).setPosition(x, y, z); mesh.setMatrixAt(i, m); mesh.setColorAt(i, color.setHex(C.crown[Math.floor(hash01(i * 1.7) * C.crown.length)])); });
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    this.root.add(mesh);
    this.disposables.push(geometry, material, mesh);
  }

  /** A soft dark patch under every building and tree, which grounds them at night when the sun casts nothing. */
  private addShadows(shadows: THREE.Matrix4[]): void {
    const T = this.T, geometry = new T.PlaneGeometry(1, 1), material = new T.MeshBasicMaterial({ color: 0x000000, map: this.softShadow, transparent: true, opacity: 0.42, depthWrite: false });
    const mesh = new T.InstancedMesh(geometry, material, shadows.length);
    shadows.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.frustumCulled = false;
    this.root.add(mesh);
    this.disposables.push(geometry, material, mesh);
  }

  /** Water on its own, smooth enough to catch the sun. */
  private addRiver(): void {
    const T = this.T, r = this.city.river, geometry = new T.PlaneGeometry(r.w, this.city.size + 2 * MARGIN), material = new T.MeshStandardMaterial({ color: C.river, roughness: 0.18, metalness: 0.1 });
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(r.x, this.city.size / 2, -0.6);
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.disposables.push(geometry, material);
  }

  private addLamps(lamps: [number, number][]): void {
    const T = this.T, m = new T.Matrix4(), head = new T.BoxGeometry(0.55, 0.55, 0.25), pool = new T.PlaneGeometry(11, 11);
    const heads = new T.InstancedMesh(head, this.lampHeads, lamps.length), pools = new T.InstancedMesh(pool, this.lampPools, lamps.length);
    lamps.forEach(([x, y], i) => { heads.setMatrixAt(i, m.makeTranslation(x, y, 4.7)); pools.setMatrixAt(i, m.makeTranslation(x, y, 0.32)); });
    heads.frustumCulled = false; pools.frustumCulled = false;
    this.root.add(heads, pools);
    this.disposables.push(head, pool, heads, pools, this.lampHeads, this.lampPools, this.lampPools.map as THREE.Texture);
  }

  /**
   * One quad per window. Homes and shops have punched windows; offices have ribbons of glass, floor after floor.
   * An unlit pane shows the sky it faces (a gradient that follows the hour); a lit one shows its own light, untouched
   * by tone mapping so it glows.
   */
  private addWindows(): { mesh: THREE.InstancedMesh; hash: Float32Array } | null {
    const T = this.T, panes: { m: THREE.Matrix4; hash: number }[] = [], right = new T.Vector3(), up = new T.Vector3(0, 0, 1), normal = new T.Vector3();
    for (const b of this.city.buildings) {
      const first = panes.length, shop = b.kind === "shop", office = b.kind === "office", tower = office && b.height >= PODIUM;
      const rect = tower ? { ...b.rect, w: b.rect.w * 0.82, d: b.rect.d * 0.82 } : b.rect;
      const floors = shop ? 1 : Math.min(24, Math.floor((b.height - 1) / 3.2)), bHash = hash01(b.id + 0.5);
      for (const [nx, ny] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const width = nx ? rect.d : rect.w, cols = shop ? 1 : Math.min(6, Math.max(1, Math.floor(width / 2.6))), cell = width / cols;
        normal.set(nx, ny, 0); right.set(-ny, nx, 0);
        for (let f = tower ? 2 : 0; f < floors; f++) for (let c = 0; c < cols; c++) {
          const along = (c + 0.5) * cell - width / 2, w = shop ? width * 0.8 : office ? cell * 0.9 : cell * 0.5, h = shop ? 1.6 : office ? 2.2 : 1.4;
          const z = LOT + (shop ? 1.3 : (office ? 1.8 : 2) + f * 3.2);
          const m = new T.Matrix4().makeBasis(right.clone().multiplyScalar(w), up.clone().multiplyScalar(h), normal);
          m.setPosition(rect.x + nx * (rect.w / 2 + 0.03) - ny * along, rect.y + ny * (rect.d / 2 + 0.03) + nx * along, z);
          // Most of a building's windows follow the building; each is a little early or late, and a quarter never come on.
          const own = hash01(panes.length * 1.37 + b.id);
          panes.push({ m, hash: own < 0.25 ? -1 : Math.min(0.999, bHash * 0.75 + own * 0.25) });
        }
      }
      if (tower) {
        // The podium's lobby: one tall pane per bay, all the way round.
        const r = b.rect;
        for (const [nx, ny] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const width = (nx ? r.d : r.w) + 0.6, cols = Math.max(2, Math.floor(width / 3.4)), cell = width / cols;
          normal.set(nx, ny, 0); right.set(-ny, nx, 0);
          for (let c = 0; c < cols; c++) {
            const along = (c + 0.5) * cell - width / 2, m = new T.Matrix4().makeBasis(right.clone().multiplyScalar(cell * 0.86), up.clone().multiplyScalar(4.4), normal);
            m.setPosition(r.x + nx * (r.w / 2 + 0.33) - ny * along, r.y + ny * (r.d / 2 + 0.33) + nx * along, LOT + 2.7);
            panes.push({ m, hash: Math.min(0.999, bHash * 0.5 + hash01(panes.length * 2.1) * 0.2) });
          }
        }
      }
      this.panesOf[b.id] = [first, panes.length];
    }
    if (!panes.length) return null;
    const geometry = new T.PlaneGeometry(1, 1), material = new T.MeshBasicMaterial({ toneMapped: false });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.glassUniforms);
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying float vPaneY;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvPaneY = position.y + 0.5;");
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vPaneY;\nuniform vec3 uGlassLow;\nuniform vec3 uGlassHigh;").replace("#include <color_fragment>",
        "#include <color_fragment>\nfloat paneLit = step(0.004, max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)));\ndiffuseColor.rgb = mix(mix(uGlassLow, uGlassHigh, vPaneY), diffuseColor.rgb * mix(0.85, 1.1, vPaneY), paneLit);");
    };
    const mesh = new T.InstancedMesh(geometry, material, panes.length), dark = new T.Color(0, 0, 0);
    panes.forEach((p, i) => { mesh.setMatrixAt(i, p.m); mesh.setColorAt(i, dark); });
    mesh.frustumCulled = false;
    this.root.add(mesh);
    this.disposables.push(geometry, material, mesh);
    this.paneMatrices = panes.map((p) => p.m);
    return { mesh, hash: Float32Array.from(panes, (p) => p.hash) };
  }

  /** A square that fades out towards its edges, rounded at the corners: the soft shadow under things. */
  private makeSoftShadow(): THREE.CanvasTexture {
    const size = 64, canvas = document.createElement("canvas"), ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    canvas.width = canvas.height = size;
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size - 0.5, v = (y + 0.5) / size - 0.5, dx = Math.max(Math.abs(u) - 0.2, 0), dy = Math.max(Math.abs(v) - 0.2, 0);
      const k = (y * size + x) * 4, a = (1 - smooth(Math.hypot(dx, dy) / 0.3)) ** 1.6;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.round(a * 255);
    }
    ctx.putImageData(img, 0, 0);
    return new this.T.CanvasTexture(canvas);
  }

  /** A round glow, bright in the middle: a street lamp's light on the pavement. */
  private makeGlow(): THREE.CanvasTexture {
    const size = 64, canvas = document.createElement("canvas"), ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    canvas.width = canvas.height = size;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,0.8)"); g.addColorStop(0.45, "rgba(255,255,255,0.32)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    const texture = new this.T.CanvasTexture(canvas);
    texture.colorSpace = this.T.SRGBColorSpace;
    return texture;
  }

  // ── people ────────────────────────────────────────────────────────────────

  /**
   * Everyone is one instanced mesh of a whole figure (legs, shoes, hips, torso, arms, hands, neck, head, hair) whose limbs
   * the vertex shader swings, plus a soft shadow at their feet and a speech bubble. The shirt wears the activity's colour
   * and glows a little so it reads at night; skin, hair and trousers differ from person to person.
   */
  setPeople(count: number, colors: PeopleColors): void {
    if (this.people) {
      const { bodies, blobs, bubbles } = this.people;
      this.root.remove(bodies, blobs, bubbles);
      for (const mesh of [bodies, blobs, bubbles]) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh.dispose(); }
      (blobs.material as THREE.MeshBasicMaterial).map?.dispose();
    }
    const T = this.T, figure = this.makeFigure(), material = new T.MeshStandardMaterial({ roughness: 0.7 });
    const anim = new T.InstancedBufferAttribute(new Float32Array(count * 4), 4);
    figure.setAttribute("aAnim", anim);
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.figureUniforms);
      shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${FIGURE_VERTEX}`)
        .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nfloat poseAngle = figureAngle();\nobjectNormal = rotY(objectNormal, poseAngle);\nvPart = aPart; vLook = aAnim.w;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed = vec3(0.0, 0.0, aJoint.z) + rotY(transformed - vec3(0.0, 0.0, aJoint.z), poseAngle);");
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${FIGURE_FRAGMENT}`)
        .replace("#include <color_fragment>", "#include <color_fragment>\nvec3 shirt = diffuseColor.rgb;\ndiffuseColor.rgb = figureColor(shirt);")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vPart < 0.5 ? shirt * uGlow : vec3(0.0);");
    };
    const bodies = new T.InstancedMesh(figure, material, count);
    const blobs = new T.InstancedMesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: this.makeGlow(), transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false }), count);
    const bubbles = new T.InstancedMesh(new T.SphereGeometry(0.3, 12, 8), new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.92 }), count);
    bodies.castShadow = true;
    for (const mesh of [bodies, blobs, bubbles]) mesh.frustumCulled = false;
    const zero = new T.Matrix4().makeScale(0, 0, 0), white = new T.Color(colors.idle);
    for (let i = 0; i < count; i++) { bodies.setColorAt(i, white); blobs.setColorAt(i, white); bubbles.setMatrixAt(i, zero); anim.setW(i, hash01(i * 3.7 + 0.1)); }
    this.root.add(blobs, bodies, bubbles);
    const heading = new Float32Array(count);
    this.people = {
      bodies, blobs, bubbles, anim, colors: Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, new T.Color(v)])), shown: new Array<string | null>(count).fill(null),
      stride: new Float32Array(count), walk: new Float32Array(count), inside: new Float32Array(count), door: new Float32Array(count * 2), heading, turned: new Uint8Array(count),
      talk: new Float32Array(count), speak: new Float32Array(count), partner: new Int32Array(count).fill(-1), ox: new Float32Array(count), oy: new Float32Array(count), lastX: new Float32Array(count), lastY: new Float32Array(count), paired: -Infinity,
    };
  }

  /**
   * Places everyone between their position one tick ago (`px`, `py`) and now, `alpha` of the way. Everything here is
   * drawn, not simulated: in the simulation a person at work, at a meal or asleep stands on their spot outside the door,
   * and a person in the park stands on theirs. On screen the first walks in through the door (and back out when they
   * leave), and the second turns to the nearest other person there, closes in and talks, the two taking turns.
   */
  updatePeople(f: PeopleFrame, alpha: number): void {
    const people = this.people;
    if (!people) return;
    const now = performance.now() / 1000, dt = this.lastPeople ? Math.min(0.1, now - this.lastPeople) : 0;
    this.lastPeople = now; this.figureUniforms.uTime.value = now % 1000;
    if (now - people.paired > 0.4) { this.pairUp(f); people.paired = now; }
    // From afar a figure is a few pixels: people and their glow grow as the camera pulls back, up to half as big again.
    const far = Math.min(1.5, Math.max(1, this.viewDistance / 120)), glow = 1.6 * Math.min(2.5, Math.max(1, this.viewDistance / 90));
    const m = this.personMatrix, q = this.personTurn, s = this.personScale, at = this.personAt, anim = people.anim, k = 1 - Math.exp(-dt * 3), turn = 1 - Math.exp(-dt * 8);
    let recolored = false;
    for (let i = 0; i < f.count; i++) {
      let x = f.px[i] + (f.x[i] - f.px[i]) * alpha, y = f.py[i] + (f.y[i] - f.py[i]) * alpha;
      const place = f.at[i], door = place >= 0 ? this.doorAt[place] : undefined, social = place >= 0 && !door, partner = social ? people.partner[i] : -1;
      if (door) { people.door[2 * i] = door[0]; people.door[2 * i + 1] = door[1]; }
      // In through the door or out of it, about a second either way.
      const inside = people.inside[i] = Math.min(1, Math.max(0, people.inside[i] + (door ? dt : -dt) * 1.1)), e = smooth(inside);
      // A conversation: both step towards each other (or apart) until they stand a pace apart.
      let tx = 0, ty = 0;
      if (partner >= 0) {
        const d = Math.hypot(f.x[partner] - f.x[i], f.y[partner] - f.y[i]), ux = d > 0.01 ? (f.x[partner] - f.x[i]) / d : i < partner ? 1 : -1, uy = d > 0.01 ? (f.y[partner] - f.y[i]) / d : 0, closer = (d - 2.8) / 2;
        tx = ux * closer; ty = uy * closer;
      }
      people.ox[i] += (tx - people.ox[i]) * k; people.oy[i] += (ty - people.oy[i]) * k;
      x += people.ox[i]; y += people.oy[i];
      if (e > 0) { x += (people.door[2 * i] - x) * e; y += (people.door[2 * i + 1] - y) * e; }
      const moved = Math.hypot(x - people.lastX[i], y - people.lastY[i]);
      people.lastX[i] = x; people.lastY[i] = y;
      if (i === this.follow) this.followAt.set(x - this.city.size / 2, y - this.city.size / 2, 0);

      // Which way they face: along the walk, at the door while going in, at the partner while talking.
      let face = f.heading[i];
      if (door && inside < 1) face = Math.atan2(people.door[2 * i + 1] - y, people.door[2 * i] - x);
      else if (partner >= 0) face = Math.atan2(f.y[partner] + people.oy[partner] - y, f.x[partner] + people.ox[partner] - x);
      if (!people.turned[i]) { people.heading[i] = face; people.turned[i] = 1; }
      const dh = Math.atan2(Math.sin(face - people.heading[i]), Math.cos(face - people.heading[i]));
      people.heading[i] += dh * turn;

      // Legs follow the ground covered: one stride is about a body length.
      const walking = f.walking[i] === 1 || (inside > 0 && inside < 1) || Math.hypot(people.ox[i] - tx, people.oy[i] - ty) > 0.15;
      people.walk[i] += ((walking ? 1 : 0) - people.walk[i]) * turn;
      people.stride[i] += Math.min(moved, 3) / (0.55 * PERSON);
      // Partners take turns: one speaks (gestures, and a bubble pops up), the other listens (nods).
      let speaking = 0;
      if (partner >= 0) { const seed = Math.min(i, partner), lead = Math.sin(now * 0.7 + seed * 1.7) > 0; speaking = lead === i < partner ? 1 : 0; }
      people.talk[i] += ((partner >= 0 ? (speaking ? 1 : 0.4) : 0) - people.talk[i]) * turn;
      people.speak[i] += (speaking - people.speak[i]) * turn;
      anim.setXYZ(i, people.stride[i], people.walk[i], people.talk[i]);

      const bob = Math.abs(Math.sin(people.stride[i] * Math.PI)) * 0.06 * PERSON * people.walk[i], size = PERSON * far * (1 - smooth((inside - 0.55) / 0.45));
      q.setFromAxisAngle(this.up, people.heading[i]);
      if (people.walk[i] > 0.01) q.multiply(this.leanBy(people.walk[i]));
      m.compose(at.set(x, y, LOT + bob), q, s.setScalar(size));
      people.bodies.setMatrixAt(i, m);
      people.blobs.setMatrixAt(i, m.compose(at.set(x, y, LOT + 0.06), this.blobTurn, this.blobScale.set(glow * size, glow * size, 1)));
      const pop = people.speak[i] * (1 + 0.08 * Math.sin(now * 9 + i));
      people.bubbles.setMatrixAt(i, m.compose(at.set(x + Math.cos(people.heading[i] + 1.2) * 0.9, y + Math.sin(people.heading[i] + 1.2) * 0.9, LOT + 1.63 * size + 1.1), this.blobTurn, this.bubbleScale.set(1.25 * pop, 1.25 * pop, 0.9 * pop)));
      const key = f.action[i] ?? "idle";
      if (people.shown[i] !== key) { people.shown[i] = key; people.bodies.setColorAt(i, people.colors[key]); people.blobs.setColorAt(i, people.colors[key]); recolored = true; }
    }
    anim.needsUpdate = true;
    people.bodies.instanceMatrix.needsUpdate = true; people.blobs.instanceMatrix.needsUpdate = true; people.bubbles.instanceMatrix.needsUpdate = true;
    if (recolored) for (const mesh of [people.bodies, people.blobs]) (mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  /** A forward lean that grows with the walk. */
  private leanBy(walk: number): THREE.Quaternion { return this.leanNow.setFromAxisAngle(this.leanAxis, 0.12 * walk); }

  /**
   * People in the same park paired off two by two, nearest first; anyone left over stands alone. A pair holds until
   * one of the two leaves, so nobody hops from conversation to conversation.
   */
  private pairUp(f: PeopleFrame): void {
    const people = this.people;
    if (!people) return;
    const byPlace = new Map<number, number[]>(), outdoors = (i: number) => f.at[i] >= 0 && !this.doorAt[f.at[i]] && !f.walking[i];
    for (let i = 0; i < f.count; i++) {
      const j = people.partner[i];
      if (j >= 0 && (j >= f.count || !outdoors(i) || !outdoors(j) || f.at[j] !== f.at[i] || people.partner[j] !== i)) people.partner[i] = -1;
    }
    for (let i = 0; i < f.count; i++) {
      if (!outdoors(i) || people.partner[i] >= 0) continue;
      const list = byPlace.get(f.at[i]);
      if (list) list.push(i); else byPlace.set(f.at[i], [i]);
    }
    for (const list of byPlace.values()) {
      for (const i of list) {
        if (people.partner[i] >= 0) continue;
        let best = -1, bestD = 14 * 14;
        for (const j of list) {
          if (j === i || people.partner[j] >= 0) continue;
          const d = (f.x[j] - f.x[i]) ** 2 + (f.y[j] - f.y[i]) ** 2;
          if (d < bestD) { bestD = d; best = j; }
        }
        if (best >= 0) { people.partner[i] = best; people.partner[best] = i; }
      }
    }
  }

  /**
   * One figure, feet at z = 0, facing +x, 1.63 tall before scaling. Each vertex knows its part (for its colour) and its
   * joint: what swings it (0 nothing, 1 leg, 2 arm, 3 head), which side it is on, and the height of the pivot.
   */
  private makeFigure(): THREE.BufferGeometry {
    const T = this.T, positions: number[] = [], normals: number[] = [], parts: number[] = [], joints: number[] = [];
    const add = (g: THREE.BufferGeometry, x: number, y: number, z: number, part: number, joint: number, side: number, pivot: number, scale?: [number, number, number]) => {
      const flat = g.index ? g.toNonIndexed() : g;
      if (scale) flat.scale(...scale);
      flat.translate(x, y, z);
      const p = flat.getAttribute("position"), n = flat.getAttribute("normal");
      for (let v = 0; v < p.count; v++) { positions.push(p.getX(v), p.getY(v), p.getZ(v)); normals.push(n.getX(v), n.getY(v), n.getZ(v)); parts.push(part); joints.push(joint, side, pivot); }
      flat.dispose(); if (flat !== g) g.dispose();
    };
    const upright = <G extends THREE.BufferGeometry>(g: G) => g.rotateX(Math.PI / 2);
    for (const side of [-1, 1]) {
      add(upright(new T.CapsuleGeometry(0.068, 0.62, 3, 8)), 0, side * 0.085, 0.44, 2, 1, side, 0.8);
      add(new T.BoxGeometry(0.2, 0.1, 0.08), 0.035, side * 0.085, 0.04, 4, 1, side, 0.8);
      add(upright(new T.CapsuleGeometry(0.05, 0.42, 3, 6)), 0, side * 0.215, 0.94, 0, 2, side, 1.18);
      add(new T.SphereGeometry(0.056, 8, 6), 0, side * 0.22, 0.66, 1, 2, side, 1.18);
    }
    add(upright(new T.CylinderGeometry(0.15, 0.14, 0.16, 12)), 0, 0, 0.8, 2, 0, 0, 0);
    add(upright(new T.CapsuleGeometry(0.15, 0.3, 4, 12)), 0, 0, 1.0, 0, 0, 0, 0, [0.78, 1.15, 1]);
    add(upright(new T.CylinderGeometry(0.05, 0.055, 0.1, 8)), 0, 0, 1.32, 1, 0, 0, 0);
    add(new T.SphereGeometry(0.125, 16, 12), 0, 0, 1.47, 1, 3, 0, 1.33);
    add(upright(new T.SphereGeometry(0.136, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)), -0.015, 0, 1.49, 3, 3, 0, 1.33);
    // The nose: which way the head faces, from close up.
    add(new T.SphereGeometry(0.025, 6, 4), 0.125, 0, 1.46, 1, 3, 0, 1.33);
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    g.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
    g.setAttribute("aPart", new T.Float32BufferAttribute(parts, 1));
    g.setAttribute("aJoint", new T.Float32BufferAttribute(joints, 3));
    return g;
  }

  // ── time of day ───────────────────────────────────────────────────────────

  /** Everything the hour decides: where the light comes from and how strong, sky and fog, lamps, windows. */
  setTime(t: number): void {
    const { a, b } = this.tmp, hour = hourOf(t), alt = sunAltitude(hour), theta = ((hour - 6) / 24) * 2 * Math.PI, day = smooth(alt / 0.25 + 0.2), side = alt >= 0 ? 1 : -1;
    // One light is the sun by day and the moon by night; it fades through zero at the horizon, so the swap is never seen.
    this.lightDir.set(Math.cos(theta) * side, -0.45 * side, Math.sin(theta) * side).normalize();
    this.sun.color.copy(alt >= 0 ? a.setHex(C.sunLow).lerp(b.setHex(C.sunHigh), smooth(alt * 2)) : a.setHex(C.moon));
    this.sun.intensity = alt >= 0 ? 2.6 * smooth(alt / 0.15) : 0.7 * smooth(-alt / 0.15);
    this.hemi.intensity = 0.55 + 0.65 * day;
    this.hemi.color.setHex(C.hemiNight).lerp(a.setHex(C.hemiDay), day);

    // The sky: night to day, the zenith deepening and a band on the sun's side of the horizon warming through dawn and dusk.
    const dusk = Math.max(0, 1 - Math.abs(alt) / 0.3), { uZenith, uHorizon, uGround, uSunDir, uSunColor, uDuskAmount } = this.skyUniforms;
    uHorizon.value.setHex(C.sky.nightHorizon).lerp(a.setHex(C.sky.dayHorizon), day);
    uZenith.value.setHex(C.sky.nightZenith).lerp(a.setHex(C.sky.dayZenith), day).lerp(b.setHex(C.sky.duskZenith), dusk * 0.3);
    uDuskAmount.value = dusk * 0.75;
    uGround.value.copy(uHorizon.value).lerp(uZenith.value, 0.35).multiplyScalar(0.62);
    this.fog.color.copy(uHorizon.value).lerp(uGround.value, 0.4);
    uSunDir.value.set(Math.cos(theta), -0.45, Math.sin(theta)).normalize();
    uSunColor.value.setHex(C.sunLow).lerp(a.setHex(C.sunHigh), smooth(alt * 3)).multiplyScalar(smooth(alt / 0.1 + 1));
    this.sky.copy(uGround.value);

    // Unlit glass shows the sky: dark by night, by day the zenith low on the pane and the horizon high.
    const { uGlassLow, uGlassHigh } = this.glassUniforms;
    uGlassLow.value.setHex(C.glass.nightLow).lerp(a.setHex(C.glass.dayLow).lerp(uZenith.value, 0.3), day);
    uGlassHigh.value.setHex(C.glass.nightHigh).lerp(a.copy(uHorizon.value).lerp(b.setHex(C.glass.dayLow), 0.5).multiplyScalar(0.85), day);

    const lampsOn = smooth(-alt / 0.08 + 0.5);
    this.figureUniforms.uGlow.value = 0.15 + 0.4 * (1 - day);
    this.lampHeads.color.setHex(C.lampOff).lerp(a.setHex(C.lampOn), lampsOn);
    this.lampPools.opacity = 0.42 * lampsOn;
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
      // Black is the shader's sign for an unlit pane.
      this.windows.setColorAt(i, lit ? a.setHex(C.lit[i % C.lit.length]) : a.setRGB(0, 0, 0));
    }
    if (changed && this.windows.instanceColor) this.windows.instanceColor.needsUpdate = true;
  }

  // ── camera and frame ──────────────────────────────────────────────────────

  /** True while the camera is still easing towards where it should be, so a paused scene keeps drawing until it gets there. */
  get settling(): boolean { return this.camera.position.distanceToSquared(this.cameraAt) > 0.01 || this.cutting; }

  /**
   * The person nearest to a point of the canvas (client coordinates), within `tolerance` CSS pixels, or −1. People are a
   * few pixels across from above, so this is a nearest-on-screen search and not a ray against their boxes.
   */
  pick(clientX: number, clientY: number, f: PeopleFrame, tolerance = 28): number {
    const rect = this.canvas.getBoundingClientRect(), v = this.personAt, half = this.city.size / 2;
    let best = -1, bestD = tolerance;
    for (let i = 0; i < f.count; i++) {
      if (this.people && this.people.inside[i] > 0.9) continue; // indoors: nobody to click
      v.set(f.x[i] - half, f.y[i] - half, 2).project(this.camera);
      if (v.z > 1) continue;
      const d = Math.hypot(rect.left + ((v.x + 1) / 2) * rect.width - clientX, rect.top + ((1 - v.y) / 2) * rect.height - clientY);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

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
    // 45° down on the whole city (a narrow canvas stands further back so it still fits), or down at street level
    // behind one person. The camera eases between the two rather than cutting.
    const following = this.follow >= 0, distance = following ? 46 : this.city.size * 1.5 * Math.max(1, 1.2 / this.camera.aspect);
    const flat = distance * (following ? 0.9 : Math.SQRT1_2), height = following ? 17 : distance * Math.SQRT1_2, ease = this.eased ? 1 - Math.exp(-dt * 3.5) : 1;
    this.lookAt.lerp(following ? this.followAt : this.origin, ease);
    this.cameraAt.set(this.lookAt.x + Math.cos(this.orbit) * flat, this.lookAt.y + Math.sin(this.orbit) * flat, height);
    this.camera.position.lerp(this.cameraAt, ease);
    this.camera.lookAt(this.lookAt.x, this.lookAt.y, following ? 2 : 0);
    this.dome.position.copy(this.camera.position);
    this.viewDistance = this.camera.position.distanceTo(this.lookAt);
    this.eased = true;
    this.cutaway(following, dt);
    this.aimLight(this.lookAt.x, this.lookAt.y, Math.min(this.city.size * 0.75, Math.max(70, this.camera.position.distanceTo(this.lookAt) * 0.8)));
    this.renderer.render(this.scene, this.camera);
    this.calls = this.renderer.info.render.calls;
  }

  /**
   * While following someone, any building standing between the camera and that person is lowered to a stub (its
   * windows, roof and everything on it put away), then raised again once it is out of the way: the person is never
   * hidden behind a tower. A building is in the way if the sight line crosses its footprint below its roof.
   */
  private cutaway(following: boolean, dt: number): void {
    const mesh = this.boxMesh;
    if (!mesh) return;
    const half = this.city.size / 2, cx = this.camera.position.x + half, cy = this.camera.position.y + half, cz = this.camera.position.z;
    const tx = this.lookAt.x + half, ty = this.lookAt.y + half, tz = 3, ease = 1 - Math.exp(-dt * 8), m = this.personMatrix;
    let moved = false, panesMoved = false, roofsMoved = false;
    for (const b of this.city.buildings) {
      let target = 1;
      if (following && b.height > 3) {
        // Liang–Barsky: the part of the sight line over the footprint, grown by a margin so walls beside the person go too.
        const { rect } = b, margin = 2.5, dx = tx - cx, dy = ty - cy;
        let t0 = 0, t1 = 1, hit = true;
        for (const [pp, q] of [[-dx, cx - (rect.x - rect.w / 2 - margin)], [dx, rect.x + rect.w / 2 + margin - cx], [-dy, cy - (rect.y - rect.d / 2 - margin)], [dy, rect.y + rect.d / 2 + margin - cy]]) {
          if (pp === 0) { if (q < 0) { hit = false; break; } } else { const t = q / pp; if (pp < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t); }
        }
        // The sight line descends towards the person, so it is lowest where it leaves the footprint.
        if (hit && t0 < t1 && cz + (tz - cz) * t1 < LOT + b.height) target = Math.min(1, 1.6 / b.height);
      }
      const now = this.stand[b.id];
      if (Math.abs(now - target) < 0.002) continue;
      const next = Math.abs(now - target) < 0.01 ? target : now + (target - now) * ease, box = this.boxes[this.bodyOf[b.id]];
      this.stand[b.id] = next; moved = true;
      mesh.setMatrixAt(this.bodyOf[b.id], m.makeScale(box.sx, box.sy, box.sz * next).setPosition(box.x, box.y, LOT + (box.sz * next) / 2));
      // Everything else that belongs to the building goes the moment it starts to sink and comes back when it stands again.
      const wasWhole = now >= 0.999, isWhole = next >= 0.999;
      if (wasWhole === isWhole) continue;
      for (const k of this.partsOf[b.id]) { const p = this.boxes[k]; mesh.setMatrixAt(k, isWhole ? m.makeScale(p.sx, p.sy, p.sz).setPosition(p.x, p.y, p.z) : m.makeScale(0, 0, 0)); }
      const roof = this.roofOf[b.id];
      if (roof >= 0 && this.roofMesh) { this.roofMesh.setMatrixAt(roof, isWhole ? this.roofMatrices[roof] : m.makeScale(0, 0, 0)); roofsMoved = true; }
      if (this.windows) {
        const [from, to] = this.panesOf[b.id];
        for (let k = from; k < to; k++) this.windows.setMatrixAt(k, isWhole ? this.paneMatrices[k] : m.makeScale(0, 0, 0));
        panesMoved = true;
      }
    }
    if (moved) mesh.instanceMatrix.needsUpdate = true;
    if (roofsMoved && this.roofMesh) this.roofMesh.instanceMatrix.needsUpdate = true;
    if (panesMoved && this.windows) this.windows.instanceMatrix.needsUpdate = true;
  }

  /** True while a building is still sinking or rising, so a paused scene keeps drawing until it is done. */
  private get cutting(): boolean { for (let i = 0; i < this.stand.length; i++) { const v = this.stand[i]; if (v !== 1 && Math.abs(v - Math.min(1, 1.6 / this.city.buildings[i].height)) > 0.002) return true; } return false; }

  /** The shadow map covers `reach` around the point being looked at, not the whole map. */
  private aimLight(x: number, y: number, wanted: number): void {
    const reach = Math.round(wanted / 10) * 10; // the shadow camera is only rebuilt in steps
    const d = this.lightDir, far = reach * 3, cam = this.sun.shadow.camera;
    this.sun.target.position.set(x, y, 0);
    this.sun.position.set(x + d.x * far * 0.5, y + d.y * far * 0.5, d.z * far * 0.5);
    if (cam.right !== reach) { cam.left = -reach; cam.right = reach; cam.top = reach; cam.bottom = -reach; cam.near = 1; cam.far = far; cam.updateProjectionMatrix(); }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    if (this.people) {
      for (const mesh of [this.people.bodies, this.people.blobs, this.people.bubbles]) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh.dispose(); }
      (this.people.blobs.material as THREE.MeshBasicMaterial).map?.dispose();
    }
    this.renderer.dispose();
  }
}
