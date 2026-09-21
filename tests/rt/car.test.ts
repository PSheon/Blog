import { readFileSync } from "node:fs";
import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";
import { IDENTITY, parseModels } from "@/lib/rt";
import { createCar, quaternionOf } from "../../content/posts/light-playground/components/game/car";

const file = readFileSync("public/posts/light-playground/models.bin"), models = parseModels(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);

describe("the car", () => {
  beforeAll(async () => { await RAPIER.init(); });
  const flat = () => { const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); world.timestep = 1 / 60; world.createCollider(RAPIER.ColliderDesc.cuboid(500, 0.5, 500).setTranslation(0, -0.5, 0)); return world; };
  const run = (world: RAPIER.World, car: ReturnType<typeof createCar>, seconds: number, input: Parameters<ReturnType<typeof createCar>["drive"]>[0]) => { for (let i = 0; i < seconds * 60; i++) { car.drive(input, 1 / 60); world.step(); } };

  it("shifts up through its gears, tops out near fifth gear's 22 m/s, reverses no faster than 4 m/s, and turns its steering wheel", () => {
    const world = flat(), car = createCar(RAPIER, world, models.models.car, IDENTITY);
    run(world, car, 2, { throttle: 0, steer: 0, brake: false });
    expect(car.gear()).toBe(1);
    run(world, car, 2, { throttle: 1, steer: 0, brake: false });
    expect(car.gear()).toBeGreaterThan(1);
    run(world, car, 12, { throttle: 1, steer: 0, brake: false });
    expect(car.gear()).toBe(5); expect(car.speed()).toBeGreaterThan(17); expect(car.speed()).toBeLessThan(23);
    const wheel = models.models.car.parts.find((p) => p.role === "steering_wheel")!;
    run(world, car, 0.5, { throttle: 0, steer: 1, brake: false });
    expect(Math.abs(car.wheel(wheel)![1])).toBeGreaterThan(0.05); // a rotation about its own z
    run(world, car, 6, { throttle: 0, steer: 0, brake: true });
    run(world, car, 6, { throttle: -1, steer: 0, brake: false });
    expect(car.speed()).toBeLessThan(-2); expect(car.speed()).toBeGreaterThan(-4.5);
    world.free();
  });

  it("settles on its wheels, drives forward along +z, steers left when told to, and stops", () => {
    const world = flat(), car = createCar(RAPIER, world, models.models.car, IDENTITY);
    run(world, car, 2, { throttle: 0, steer: 0, brake: false });
    const rest = car.body.translation();
    expect(car.up()).toBeGreaterThan(0.99);
    expect(rest.y).toBeGreaterThan(0.2); expect(rest.y).toBeLessThan(0.7); // on its springs, not on its belly and not in the air
    run(world, car, 3, { throttle: 1, steer: 0, brake: false });
    expect(car.speed()).toBeGreaterThan(6); expect(car.speed()).toBeLessThan(40);
    expect(car.body.translation().z - rest.z).toBeGreaterThan(8);
    expect(Math.abs(car.body.translation().x - rest.x)).toBeLessThan(1);
    expect(car.up()).toBeGreaterThan(0.97);
    run(world, car, 1.5, { throttle: 0.6, steer: 1, brake: false });
    expect(car.body.translation().x - rest.x).toBeGreaterThan(1.5); // +x is the driver's left when facing +z
    expect(car.up()).toBeGreaterThan(0.9);
    run(world, car, 4, { throttle: 0, steer: 0, brake: true });
    expect(Math.abs(car.speed())).toBeLessThan(0.3);
    world.free();
  });

  it("collides: driven into a parked car, it shoves it along and is slowed down itself", () => {
    const world = flat(), car = createCar(RAPIER, world, models.models.car, IDENTITY), parked = createCar(RAPIER, world, models.models.car, [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 14]);
    run(world, car, 2, { throttle: 0, steer: 0, brake: false });
    const before = parked.body.translation().z;
    let fastest = 0;
    for (let i = 0; i < 4 * 60; i++) { car.drive({ throttle: 1, steer: 0, brake: false }, 1 / 60); parked.drive({ throttle: 0, steer: 0, brake: false }, 1 / 60); world.step(); fastest = Math.max(fastest, car.speed()); }
    expect(parked.body.translation().z - before).toBeGreaterThan(1.5); // the parked car was pushed
    expect(car.body.translation().z).toBeLessThan(parked.body.translation().z); // and not driven through
    expect(car.speed()).toBeLessThan(fastest); // the crash cost speed
    world.free();
  });

  it("turns a basis into the quaternion that gives it back", () => {
    const q = quaternionOf([0, 0, -1, 0, 1, 0, 1, 0, 0]); // a quarter turn about y
    expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 6);
    expect(Math.abs(q.y)).toBeCloseTo(Math.SQRT1_2, 5);
  });
});
