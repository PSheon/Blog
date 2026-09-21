import type RAPIER from "@dimforge/rapier3d-compat";
import { compose, fromPose, rotationX, rotationY, type Mat34, type Model, type Part } from "@/lib/rt";
import { quaternionOf } from "./car";

/**
 * A helicopter and an aeroplane, as games fly them rather than as aircraft do. Both are rigid bodies shaped by their
 * models' boxes; what holds them up is a force computed here every step.
 *
 * Helicopter: the rotor pushes along the body's own up. With the engine on it carries the weight by itself, so letting
 * go of everything hovers; `up`/`down` add or take away lift, the stick tilts (forward/back) and turns (left/right),
 * and a spring pulls the body level again. It moves because tilted lift has a sideways part.
 *
 * Aeroplane: `up` is the throttle, `down` the brake. Lift grows with the square of the forward speed; the stick pitches
 * and rolls with an authority that also grows with speed (no air, no control); and the velocity is bent towards where
 * the nose points, which is what wings do and what makes it fly like a plane and not like a thrown brick. On the ground
 * it is a three-wheeled car.
 */
export interface Fly { /** stick: x right, y forward */ x: number; y: number; up: boolean; down: boolean }
type V = { x: number; y: number; z: number };

const axes = (q: { x: number; y: number; z: number; w: number }) => ({
  right: { x: 1 - 2 * (q.y * q.y + q.z * q.z), y: 2 * (q.x * q.y + q.z * q.w), z: 2 * (q.x * q.z - q.y * q.w) },
  up: { x: 2 * (q.x * q.y - q.z * q.w), y: 1 - 2 * (q.x * q.x + q.z * q.z), z: 2 * (q.y * q.z + q.x * q.w) },
  forward: { x: 2 * (q.x * q.z + q.y * q.w), y: 2 * (q.y * q.z - q.x * q.w), z: 1 - 2 * (q.x * q.x + q.y * q.y) },
});
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z, scaled = (a: V, s: number): V => ({ x: a.x * s, y: a.y * s, z: a.z * s }), plus = (...v: V[]): V => v.reduce((a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }));

function chassis(R: typeof RAPIER, world: RAPIER.World, model: Model, pose: Mat34, mass: number, lift: number, angularDamping: number) {
  const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(pose[9], pose[10] + lift, pose[11]).setRotation(quaternionOf(pose)).setLinearDamping(0.1).setAngularDamping(angularDamping));
  const boxes = model.colliders.filter((c) => c.shape === "box"), volume = boxes.reduce((v, c) => v + (c.shape === "box" ? 8 * c.half[0] * c.half[1] * c.half[2] : 0), 0);
  for (const c of boxes) if (c.shape === "box") world.createCollider(R.ColliderDesc.cuboid(c.half[0], c.half[1], c.half[2]).setTranslation(c.at[0], c.at[1], c.at[2]).setDensity(mass / volume).setFriction(0.6), body);
  // The spheres are what it stands on (a helicopter's skid ends are four of them): weightless, but without them it sits down on its tail.
  for (const c of model.colliders) if (c.shape === "sphere") world.createCollider(R.ColliderDesc.ball(c.radius).setTranslation(c.at[0], c.at[1], c.at[2]).setDensity(0).setFriction(0.6), body);
  return body;
}
const stirring = (body: RAPIER.RigidBody) => !body.isSleeping() && (Math.hypot(body.linvel().x, body.linvel().y, body.linvel().z) > 0.03 || Math.hypot(body.angvel().x, body.angvel().y, body.angvel().z) > 0.03);

export function createHelicopter(R: typeof RAPIER, world: RAPIER.World, model: Model, pose: Mat34) {
  const MASS = 700, body = chassis(R, world, model, pose, MASS, 0.3, 2.5);
  let spin = 0, power = 0; // power: the rotor takes a moment to spin up and down
  return {
    body, kind: "heli" as const,
    drive(input: Fly | null, dt: number): void {
      power += ((input ? 1 : 0) - power) * Math.min(1, dt * (input ? 1.2 : 0.6));
      spin += power * 38 * dt;
      if (power < 0.02) return;
      body.wakeUp();
      const mass = body.mass(), a = axes(body.rotation()), g = 9.81, climb = input ? (input.up ? 7 : 0) - (input.down ? 6 : 0) : -2;
      body.resetForces(true); body.resetTorques(true);
      body.addForce(scaled(a.up, mass * (g + climb) * power / Math.max(0.5, a.up.y)), true); // divided by the tilt: tilting does not sink it
      const w = body.angvel(), level = { x: a.up.z, y: 0, z: -a.up.x }, want = input ?? { x: 0, y: 0, up: false, down: false };
      // tilt by the stick, turn by the stick, spring back level, and damp what is left
      const torque = plus(scaled(a.right, want.y * 9), scaled({ x: 0, y: 1, z: 0 }, -want.x * 6), scaled(level, -14), scaled(w, -3));
      body.addTorque(scaled(torque, mass * 0.35 * power), true);
      const v = body.linvel(); body.addForce({ x: -v.x * mass * 0.35, y: -v.y * mass * 1.3, z: -v.z * mass * 0.35 }, true); // air
    },
    moving: () => power > 0.02 || stirring(body),
    pose: (): Mat34 => fromPose(body.translation(), body.rotation()),
    part: (p: Part): Mat34 | null => (p.role === "rotor" ? rotationX(spin * (p.name === "Cube.002" ? 1.7 : 1)) : null),
  };
}

export function createAeroplane(R: typeof RAPIER, world: RAPIER.World, model: Model, pose: Mat34) {
  const MASS = 520, REST = 0.16, RADIUS = 0.11, body = chassis(R, world, model, pose, MASS, 0.35, 1.2), gear = world.createVehicleController(body);
  const wheels = model.parts.filter((p): p is Part & { rest: Mat34 } => p.role === "wheel" && !!p.rest);
  gear.indexUpAxis = 1; gear.setIndexForwardAxis = 2;
  wheels.forEach((w, i) => { gear.addWheel({ x: w.rest[9], y: w.rest[10] + REST, z: w.rest[11] }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, REST, RADIUS); gear.setWheelSuspensionStiffness(i, 60); gear.setWheelSuspensionCompression(i, 4); gear.setWheelSuspensionRelaxation(i, 5); gear.setWheelMaxSuspensionTravel(i, 0.12); gear.setWheelMaxSuspensionForce(i, 40_000); gear.setWheelFrictionSlip(i, 1.6); });
  let spin = 0, throttle = 0;
  return {
    body, kind: "airplane" as const,
    drive(input: Fly | null, dt: number): void {
      throttle += ((input?.up ? 1 : 0) - throttle) * Math.min(1, dt * 0.9);
      spin += (4 + throttle * 60) * (input ? 1 : throttle) * dt;
      const a = axes(body.rotation()), v = body.linvel(), mass = body.mass(), forwardSpeed = dot(v, a.forward), air = Math.min(1, Math.abs(forwardSpeed) / 22);
      wheels.forEach((w, i) => { if (w.steering) gear.setWheelSteering(i, -(input?.x ?? 0) * 0.5); gear.setWheelBrake(i, input?.down ? 12 : input ? 0.05 : 2); });
      gear.updateVehicle(dt);
      // Parked on three springs it never quite stops trembling, and a thing that trembles redraws the whole picture every
      // frame. With nobody in it and next to no speed, it is put to sleep.
      if (!input && throttle < 0.02 && Math.hypot(v.x, v.y, v.z) < 0.25 && Math.hypot(body.angvel().x, body.angvel().y, body.angvel().z) < 0.25) { body.sleep(); return; }
      if (!input && throttle < 0.02 && !stirring(body)) return;
      body.wakeUp(); body.resetForces(true); body.resetTorques(true);
      body.addForce(scaled(a.forward, mass * 13 * throttle), true); // the propeller
      body.addForce(scaled(a.up, mass * Math.min(14, 0.034 * forwardSpeed * forwardSpeed)), true); // the wings: level flight at about 17 m/s
      body.addForce(scaled(v, -mass * (0.02 + 0.004 * Math.hypot(v.x, v.y, v.z))), true); // drag
      const side = dot(v, a.right), sink = dot(v, a.up); // the wings and the tail refuse to be pushed sideways or flat through the air
      body.addForce(plus(scaled(a.right, -side * mass * 1.6 * air), scaled(a.up, -sink * mass * 1.2 * air)), true);
      const w = body.angvel(), want = input ?? { x: 0, y: 0, up: false, down: false };
      // stick back (y < 0) lifts the nose; stick right rolls right and, with it, turns
      const torque = plus(scaled(a.right, want.y * 2.2 * air), scaled(a.forward, want.x * 3 * air), scaled(a.up, -want.x * 0.9 * air), scaled({ x: a.up.z, y: 0, z: -a.up.x }, -1.6 * air * (want.x === 0 ? 1 : 0.2)), scaled(w, -1.4 * (0.3 + air)));
      body.addTorque(scaled(torque, mass * 0.8), true);
    },
    moving: () => throttle > 0.02 || stirring(body),
    pose: (): Mat34 => fromPose(body.translation(), body.rotation()),
    part(p: Part): Mat34 | null {
      if (p.role === "rotor") return rotationX(spin);
      const i = wheels.indexOf(p as Part & { rest: Mat34 });
      if (i < 0) return null;
      return compose([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, REST - (gear.wheelSuspensionLength(i) ?? REST), 0], compose(rotationY(gear.wheelSteering(i) ?? 0), rotationX(gear.wheelRotation(i) ?? 0)));
    },
    speed: () => dot(body.linvel(), axes(body.rotation()).forward),
    throttle: () => throttle,
  };
}
export type Helicopter = ReturnType<typeof createHelicopter>;
export type Aeroplane = ReturnType<typeof createAeroplane>;
