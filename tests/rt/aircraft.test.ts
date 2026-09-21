import { readFileSync } from "node:fs";
import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";
import { IDENTITY, parseModels } from "@/lib/rt";
import { createAeroplane, createHelicopter, type Fly } from "../../content/posts/light-playground/components/game/aircraft";

const file = readFileSync("public/posts/light-playground/models.bin"), models = parseModels(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
const flat = () => { const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); world.timestep = 1 / 60; world.createCollider(RAPIER.ColliderDesc.cuboid(2000, 0.5, 2000).setTranslation(0, -0.5, 0)); return world; };
const upright = (b: RAPIER.RigidBody) => { const q = b.rotation(); return 1 - 2 * (q.x * q.x + q.z * q.z); };
const idle: Fly = { x: 0, y: 0, yaw: 0, up: false, down: false, wheelBrake: false };
/** which way the nose points, as an angle about y (0 is +z, growing towards +x, which is its left) */
const heading = (b: RAPIER.RigidBody) => { const q = b.rotation(); return Math.atan2(2 * (q.x * q.z + q.y * q.w), 1 - 2 * (q.x * q.x + q.y * q.y)); };

describe("the aircraft", () => {
  beforeAll(async () => { await RAPIER.init(); });

  it("helicopter: sits still with nobody in it, climbs when told to, hovers when let go, leans and travels forward, comes down", () => {
    const world = flat(), heli = createHelicopter(RAPIER, world, models.models.heli, IDENTITY);
    const run = (seconds: number, input: Fly | null) => { for (let i = 0; i < seconds * 60; i++) { heli.drive(input, 1 / 60); world.step(); } };
    run(6, null); // long enough to fall over, if it is going to
    const rest = heli.body.translation().y;
    expect(rest).toBeLessThan(1.5); expect(upright(heli.body)).toBeGreaterThan(0.98);
    run(5, idle); // Sketchbook's engine takes five seconds to come up
    expect(heli.power()).toBeCloseTo(1, 5);
    run(4, { ...idle, up: true });
    const high = heli.body.translation().y;
    expect(high - rest).toBeGreaterThan(4);
    run(6, idle); // Sketchbook damps the climb gently (1 % a step) and cancels 98 % of gravity: it coasts up, then sinks a third of a metre a second
    expect(Math.abs(heli.body.linvel().y)).toBeLessThan(0.6); // hovering: neither climbing nor falling
    expect(upright(heli.body)).toBeGreaterThan(0.97);
    const z0 = heli.body.translation().z;
    run(3, { ...idle, y: 1 });
    expect(heli.body.translation().z - z0).toBeGreaterThan(4); // nose down, forwards along +z
    expect(upright(heli.body)).toBeGreaterThan(0.5); // held for three seconds it leans a long way, as Sketchbook's does
    run(2, idle);
    expect(upright(heli.body)).toBeGreaterThan(0.95); // levels itself
    const h0 = heading(heli.body), x0 = heli.body.translation().x;
    run(1.5, { ...idle, yaw: -1 }); // Q
    expect(heading(heli.body) - h0).toBeGreaterThan(0.5); // turns to its left, on the spot
    expect(upright(heli.body)).toBeGreaterThan(0.95);
    run(2, idle);
    const h1 = heading(heli.body), left = { x: Math.cos(h1), z: -Math.sin(h1) }, p1 = heli.body.translation();
    run(2, { ...idle, x: -1 }); // A: rolls left and slides that way, without turning
    const p2 = heli.body.translation();
    expect((p2.x - p1.x) * left.x + (p2.z - p1.z) * left.z).toBeGreaterThan(2);
    expect(Math.abs(heading(heli.body) - h1)).toBeLessThan(0.35);
    expect(x0).toBeDefined();
    run(2, idle);
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
    expect(plane.speed()).toBeGreaterThan(9); // Sketchbook's numbers: about 11 m/s after seven seconds, and the controls have all their bite from 10
    expect(Math.abs(plane.body.translation().x)).toBeLessThan(6); // straight down the runway
    run(5, { ...idle, up: true }); // at full throttle it leaves the ground by itself, tail low, at about 12 m/s, and climbs
    expect(plane.grounded()).toBe(0);
    expect(plane.body.translation().y - rest).toBeGreaterThan(1.5);
    expect(upright(plane.body)).toBeGreaterThan(0.9);
    expect(plane.speed()).toBeGreaterThan(12);
    const nose = () => { const q = plane.body.rotation(); return 2 * (q.y * q.z - q.x * q.w); }, before = nose(); // the nose's height: forward's y
    run(0.25, { ...idle, up: true, y: -1 }); // S, a tap: held, Sketchbook's aeroplane goes over in a loop
    run(0.5, { ...idle, up: true });
    expect(nose() - before).toBeGreaterThan(0.1);
    const h0 = heading(plane.body);
    run(2, { ...idle, up: true, yaw: 1 }); // E: the rudder swings the nose to the right
    expect(heading(plane.body) - h0).toBeLessThan(-0.15);
    const rudder = models.models.airplane.parts.find((p) => p.role === "rudder")!, aileronL = models.models.airplane.parts.find((p) => p.role === "aileron" && p.side === "left")!, aileronR = models.models.airplane.parts.find((p) => p.role === "aileron" && p.side === "right")!;
    expect(plane.part(rudder)![2]).not.toBeCloseTo(0, 2); // the surface itself is deflected (a rotation about its y)
    run(1, { ...idle, up: true, x: -1 });
    expect(plane.part(aileronL)![2]).toBeCloseTo(-plane.part(aileronR)![2], 5); // ailerons move against each other
    expect(Math.abs(plane.part(aileronL)![2])).toBeGreaterThan(0.3);
    world.free();
  });

  it("aeroplane on the ground: Q and E steer the nose wheel, B stops it", () => {
    const world = flat(), plane = createAeroplane(RAPIER, world, models.models.airplane, IDENTITY);
    const run = (seconds: number, input: Fly | null) => { for (let i = 0; i < seconds * 60; i++) { plane.drive(input, 1 / 60); world.step(); } };
    run(2, null); run(3, idle); run(2.5, { ...idle, up: true });
    expect(plane.grounded()).toBeGreaterThan(0);
    const h0 = heading(plane.body);
    run(2, { ...idle, yaw: -1 }); // Q
    expect(heading(plane.body) - h0).toBeGreaterThan(0.2);
    const rolling = plane.speed();
    run(3, { ...idle, wheelBrake: true });
    expect(plane.speed()).toBeLessThan(Math.max(0.5, rolling * 0.25));
    world.free();
  });
});
