"use client";

import type * as THREE from "three";
import type { State } from "./sim";

/*
 * The 3D view: the ship, the sea, the deck and the flame. The geometry is packed by scripts/rocket/pack-starship.mjs
 * from clarence365's Ship 24 (Sketchfab, CC BY 4.0) — geometry only, quantised, 370 KB — and painted here in the
 * site's own colours rather than with the model's textures.
 */
export interface Packed { positions: Float32Array; normals: Float32Array; indices: Uint32Array; kinds: Uint8Array; height: number }

export function parseShip(buffer: ArrayBuffer): Packed {
  const view = new DataView(buffer);
  const jsonBytes = view.getUint32(0, true);
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, jsonBytes)));
  let at = 4 + jsonBytes;
  const p16 = new Int16Array(buffer, at, meta.vertices * 3); at += p16.byteLength;
  const n8 = new Int8Array(buffer, at, meta.vertices * 3); at += n8.byteLength;
  at = Math.ceil(at / 4) * 4; // u32 indices need a 4-byte boundary
  const indices = new Uint32Array(buffer, at, meta.triangles * 3); at += indices.byteLength;
  const kinds = new Uint8Array(buffer, at, meta.triangles);
  const positions = Float32Array.from(p16, (v) => (v / 32767) * meta.extent);
  const normals = Float32Array.from(n8, (v) => v / 127);
  return { positions, normals, indices, kinds, height: meta.height };
}

/** Steel, heatshield tiles, engines, flaps — four groups, so the model reads without a single texture. */
const PAINT = [
  { metalness: 0.95, roughness: 0.28, colour: 0xc8cede },
  { metalness: 0.1, roughness: 0.9, colour: 0x1a1c24 },
  { metalness: 0.8, roughness: 0.45, colour: 0x6b7180 },
  { metalness: 0.9, roughness: 0.35, colour: 0xa8aebc },
];

export interface Stage {
  render(s: State, throttle: number, lit: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

export async function makeStage(canvas: HTMLCanvasElement, packed: Packed, night = true, still = false): Promise<Stage> {
  const t = (await import("@/lib/three")) as unknown as typeof THREE;
  const renderer = new t.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  const scene = new t.Scene();
  scene.fog = new t.Fog(night ? 0x0b1226 : 0xdfe6f5, 260, 1600);

  const camera = new t.PerspectiveCamera(42, 1, 1, 4000);

  scene.add(new t.HemisphereLight(0xbcd6ff, 0x101830, night ? 2.1 : 2.2));
  const sun = new t.DirectionalLight(0xfff0dd, night ? 2.4 : 3.2);
  sun.position.set(-120, 200, 140);
  scene.add(sun);
  // A cool fill from the camera's side. Bare steel at night is otherwise a silhouette: this is what makes the hull
  // and the flaps readable without washing out the plume, which is the only warm light in the scene.
  const fill = new t.DirectionalLight(0x9fc4ff, night ? 1.5 : 0.6);
  fill.position.set(160, 70, 150);
  scene.add(fill);

  // The sea, and the deck it has to land on: 52 m across, as a droneship is.
  const sea = new t.Mesh(new t.PlaneGeometry(4000, 4000), new t.MeshStandardMaterial({ color: night ? 0x0a1020 : 0x2a4a72, roughness: 0.75, metalness: 0.1 }));
  sea.rotation.x = -Math.PI / 2;
  scene.add(sea);
  // 44 m across, so the deck's edge is the same limit the cutaway below draws and the same one the rules use: land
  // more than 20 m from the middle and you have missed it.
  const deck = new t.Mesh(new t.BoxGeometry(44, 3, 44), new t.MeshStandardMaterial({ color: 0x39405a, roughness: 0.9 }));
  deck.position.y = 1.5;
  scene.add(deck);
  const ring = new t.Mesh(new t.RingGeometry(18, 20, 64), new t.MeshBasicMaterial({ color: 0x79dafa, transparent: true, opacity: 0.8, side: t.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 3.1;
  scene.add(ring);

  // The ship, split into one mesh per paint so each group can have its own material.
  const ship = new t.Group();
  for (let paint = 0; paint < PAINT.length; paint++) {
    const keep: number[] = [];
    for (let i = 0; i < packed.kinds.length; i++) if (packed.kinds[i] === paint) keep.push(packed.indices[i * 3], packed.indices[i * 3 + 1], packed.indices[i * 3 + 2]);
    if (keep.length === 0) continue;
    const geometry = new t.BufferGeometry();
    geometry.setAttribute("position", new t.BufferAttribute(packed.positions, 3));
    geometry.setAttribute("normal", new t.BufferAttribute(packed.normals, 3));
    geometry.setIndex(keep);
    const { colour, ...rest } = PAINT[paint];
    ship.add(new t.Mesh(geometry, new t.MeshStandardMaterial({ color: colour, ...rest })));
  }
  scene.add(ship);

  /*
   * The plume. One cone is a tin can with a pointy end: a Raptor's exhaust is a small white-hot core inside a long
   * translucent flare that frays as it goes. Three nested cones do that — core, flare, halo — with a shock diamond
   * near the throat, and the whole thing breathes a few percent per frame (held still under prefers-reduced-motion).
   */
  const plume = new t.Group();
  const cone = (radius: number, length: number, colour: number, opacity: number) => {
    const geometry = new t.ConeGeometry(radius, length, 24, 12, true);
    // Additive blending adds nothing where the colour is black, so painting the mesh from bright at the throat to
    // black at the tip makes the plume fade out instead of ending in a hard cone. No shader, no texture.
    const position = geometry.getAttribute("position");
    const tint = new t.Color(colour);
    const colours = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      // The cone points down after the rotation below: +y here is the throat.
      const along = (position.getY(i) + length / 2) / length;
      const fade = Math.pow(along, 1.6);
      colours[i * 3] = tint.r * fade;
      colours[i * 3 + 1] = tint.g * fade;
      colours[i * 3 + 2] = tint.b * fade;
    }
    geometry.setAttribute("color", new t.BufferAttribute(colours, 3));
    const mesh = new t.Mesh(geometry, new t.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity, blending: t.AdditiveBlending, side: t.DoubleSide, depthWrite: false }));
    mesh.rotation.x = Math.PI;
    mesh.position.y = -length / 2;
    return mesh;
  };
  /*
   * One of these per sea-level Raptor, on the 2.6 m circle they actually sit on, so that "2 × 50 %" in the readout
   * and two flames in the picture are the same fact. They are ordered so the one that lights first faces the camera.
   */
  const makeEngine = () => {
    const group = new t.Group();
    const core = cone(1.5, 24, 0xfff6e8, 1);
    const flare = cone(3.1, 52, 0xffb066, 0.5);
    const halo = cone(5.0, 82, 0xff7033, 0.2);
    // Shock diamonds: a train down the core, appearing and spreading as the throttle rises.
    const diamonds = Array.from({ length: 5 }, () => {
      const mesh = new t.Mesh(new t.SphereGeometry(1.1, 12, 8), new t.MeshBasicMaterial({ color: 0xe8f1ff, transparent: true, opacity: 0.9, blending: t.AdditiveBlending, depthWrite: false }));
      mesh.scale.set(1, 2.2, 1);
      return mesh;
    });
    group.add(halo, flare, core, ...diamonds);
    return { group, core, flare, halo, diamonds };
  };
  const engines = [0, 1, 2].map((i) => {
    const e = makeEngine();
    const angle = (Math.PI / 2) * (i === 0 ? 1 : i === 1 ? 1 + 4 / 3 : 1 + 8 / 3);
    e.group.position.set(Math.cos(angle) * 2.6, 0, Math.sin(angle) * 2.6);
    plume.add(e.group);
    return e;
  });
  ship.add(plume);
  const glow = new t.PointLight(0xffb070, 0, 260, 2);
  ship.add(glow);
  const wash = new t.PointLight(0xff9a50, 0, 700, 2);
  scene.add(wash);
  let flicker = 0;

  let width = 1, height = 1;
  return {
    resize(w, h) {
      width = w; height = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    render(s, throttle, lit) {
      ship.position.set(s.x, s.y, 0);
      ship.rotation.z = -s.a;
      // The plumes start at the engine bells and grow with throttle; the flicker is small and fast, the way a real
      // one looks, and it is frozen for a reader who asked for less motion.
      plume.position.y = -2;
      const burning = throttle > 0 ? Math.max(0, Math.min(3, Math.round(lit))) : 0;
      plume.visible = burning > 0;
      if (burning > 0) {
        flicker = still ? 1 : 0.93 + Math.abs(Math.sin(performance.now() / 37)) * 0.09 + Math.abs(Math.sin(performance.now() / 13)) * 0.04;
        // 40 % and 100 % have to look different at a glance: the plume grows, whitens and tightens, and the shock
        // diamonds appear. At the throttle floor it is a stubby orange flame; at full it is a long white spear.
        const hard = (throttle - 0.4) / 0.6; // 0 at the floor, 1 at full
        const length = (0.55 + hard * 1.15) * flicker;
        const breathe = still ? 1 : 0.96 + Math.sin(performance.now() / 23) * 0.06;
        engines.forEach((e, index) => {
          e.group.visible = index < burning;
          if (!e.group.visible) return;
          e.core.scale.set(0.75 + hard * 0.5, length, 0.75 + hard * 0.5);
          e.flare.scale.set(0.6 + hard * 0.75, length * breathe, 0.6 + hard * 0.75);
          e.halo.scale.set(0.5 + hard * 0.9, length * 0.92, 0.5 + hard * 0.9);
          (e.core.material as THREE.MeshBasicMaterial).opacity = 0.75 + hard * 0.25;
          (e.flare.material as THREE.MeshBasicMaterial).color.setRGB(1, 0.58 + hard * 0.28, 0.28 + hard * 0.5);
          (e.halo.material as THREE.MeshBasicMaterial).opacity = 0.12 + hard * 0.16;
          e.diamonds.forEach((d, i) => {
            d.visible = hard > 0.3 + i * 0.13;
            d.position.y = -5 - i * (4 + hard * 3.5);
            const size = (1 - i * 0.13) * (0.5 + hard * 0.6);
            d.scale.set(size, size * 2.2, size);
          });
        });
      }
      // The ship is bare steel, so most of what makes it look lit while burning is its own plumes — and three of
      // them throw three times the light of one.
      glow.intensity = burning > 0 ? (0.35 + throttle * 0.9) * 420 * burning * flicker : 0;
      glow.position.y = -12;
      wash.position.set(s.x, Math.max(2, s.y - 30), 0);
      wash.intensity = burning > 0 ? Math.max(0, 1 - s.y / 220) * throttle * 1100 * burning * flicker : 0;
      // The camera holds the whole ship however it is lying. The model's origin is at the engines, so upright it
      // reaches 50 m above that point and the plume hangs about 50 m below: at this distance the frame covers about
      // 160 m of height, centred a little above the engines, and the nose never leaves the top of the picture.
      camera.position.set(s.x + 55, s.y + 26, 205);
      camera.lookAt(s.x, s.y + 6, 0);
      renderer.render(scene, camera);
      void width; void height;
    },
    dispose() {
      renderer.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose?.();
      });
    },
  };
}
