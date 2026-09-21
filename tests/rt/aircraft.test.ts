import { readFileSync } from "node:fs";
import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";
import { IDENTITY, parseModels } from "@/lib/rt";
import { createAeroplane, createHelicopter, type Fly } from "../../content/posts/light-playground/components/game/aircraft";

const file = readFileSync("public/posts/light-playground/models.bin"), models = parseModels(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
const flat = () => { const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); world.timestep = 1 / 60; world.createCollider(RAPIER.ColliderDesc.cuboid(2000, 0.5, 2000).setTranslation(0, -0.5, 0)); return world; };
const upright = (b: RAPIER.RigidBody) => { const q = b.rotation(); return 1 - 2 * (q.x * q.x + q.z * q.z); };
const idle: Fly = { x: 0, y: 0, up: false, down: false };

describe("the aircraft", () => {
  beforeAll(async () => { await RAPIER.init(); });

  it("helicopter: sits still with nobody in it, climbs when told to, hovers when let go, leans and travels forward, comes down", () => {
    const world = flat(), heli = createHelicopter(RAPIER, world, models.models.heli, IDENTITY);
    const run = (seconds: number, input: Fly | null) => { for (let i = 0; i < seconds * 60; i++) { heli.drive(input, 1 / 60); world.step(); } };
    run(6, null); // long enough to fall over, if it is going to
    const rest = heli.body.translation().y;
    expect(rest).toBeLessThan(1.5); expect(upright(heli.body)).toBeGreaterThan(0.98);
    run(4, { ...idle, up: true });
    const high = heli.body.translation().y;
    expect(high - rest).toBeGreaterThan(4);
    run(3, idle);
    expect(Math.abs(heli.body.linvel().y)).toBeLessThan(0.6); // hovering: neither climbing nor falling
    expect(upright(heli.body)).toBeGreaterThan(0.97);
    const z0 = heli.body.translation().z;
    run(3, { ...idle, y: 1 });
    expect(heli.body.translation().z - z0).toBeGreaterThan(4); // nose down, forwards along +z
    expect(upright(heli.body)).toBeGreaterThan(0.75);
    run(2, idle);
    expect(upright(heli.body)).toBeGreaterThan(0.95); // levels itself
    run(8, { ...idle, down: true });
    expect(heli.body.translation().y).toBeLessThan(high - 3);
    world.free();
  });

  it("aeroplane: rolls down the runway, leaves the ground when the stick comes back, and keeps flying the right way up", () => {
    const world = flat(), plane = createAeroplane(RAPIER, world, models.models.airplane, IDENTITY);
    const run = (seconds: number, input: Fly | null) => { for (let i = 0; i < seconds * 60; i++) { plane.drive(input, 1 / 60); world.step(); } };
    run(2, null);
    const rest = plane.body.translation().y;
    expect(upright(plane.body)).toBeGreaterThan(0.95); expect(rest).toBeLessThan(1); // it sits a little nose-up on its three wheels
    expect(plane.moving()).toBe(false); // parked, it comes to rest: a thing that trembles would redraw the picture for ever
    run(7, { ...idle, up: true });
    expect(plane.speed()).toBeGreaterThan(14);
    expect(Math.abs(plane.body.translation().x)).toBeLessThan(6); // straight down the runway
    run(4, { ...idle, up: true, y: -1 });
    expect(plane.body.translation().y - rest).toBeGreaterThan(3);
    run(4, { ...idle, up: true });
    expect(upright(plane.body)).toBeGreaterThan(0.8);
    expect(plane.speed()).toBeGreaterThan(12);
    world.free();
  });
});
