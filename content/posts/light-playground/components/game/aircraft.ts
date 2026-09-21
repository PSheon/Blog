import type RAPIER from "@dimforge/rapier3d-compat";
import { compose, fromPose, rotationX, rotationY, type Mat34, type Model, type Part } from "@/lib/rt";
import { quaternionOf, Spring } from "./car";

/**
 * Sketchbook's helicopter and aeroplane, ported step for step (vehicles/Helicopter.ts and Airplane.ts, MIT, Jan Blaha).
 * Both are rigid bodies shaped by their models' boxes. Sketchbook flies them by editing the body's velocities before
 * every 60 Hz physics step, in metres per second per step; the numbers below are its numbers, and `k` stretches them
 * if a step is ever not 1/60 s.
 *
 * Helicopter: the engine takes five seconds to come up. With power it cancels 98 % of gravity along its own up (less
 * as it tilts), W/S pitch, A/D roll, Q/E yaw, Shift and Space climb and sink, and while someone is in it a correction
 * turns its up towards the sky.
 *
 * Aeroplane: Shift is the throttle, Space the air brake, B the wheel brake. The controls only bite with forward speed
 * (all of them at 10 m/s). Drag is taken from the whole velocity and given back along the nose, which is what bends the
 * flight path to where the nose points; lift is small and capped. On the ground Q/E or A/D steer the nose wheel.
 * Sketchbook also writes a lighter mass (down to 40 %) into the body as it gathers speed. In cannon-es that number is
 * only read by the wheels' springs (the body's inverse mass is not recomputed), so what it does is soften the landing
 * gear at speed; here the springs' stiffness is scaled the same way.
 */
export interface Fly { /** roll: −1 left (A) … 1 right (D) */ x: number; /** pitch: 1 nose down (W) … −1 nose up (S) */ y: number; /** −1 left (Q) … 1 right (E) */ yaw: number; /** Shift: climb, or throttle */ up: boolean; /** Space: sink, or air brake */ down: boolean; /** B */ wheelBrake: boolean }
type V = { x: number; y: number; z: number };

const axes = (q: { x: number; y: number; z: number; w: number }) => ({
  right: { x: 1 - 2 * (q.y * q.y + q.z * q.z), y: 2 * (q.x * q.y + q.z * q.w), z: 2 * (q.x * q.z - q.y * q.w) },
  up: { x: 2 * (q.x * q.y - q.z * q.w), y: 1 - 2 * (q.x * q.x + q.z * q.z), z: 2 * (q.y * q.z + q.x * q.w) },
  forward: { x: 2 * (q.x * q.z + q.y * q.w), y: 2 * (q.y * q.z - q.x * q.w), z: 1 - 2 * (q.x * q.x + q.y * q.y) },
});
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z, scaled = (a: V, s: number): V => ({ x: a.x * s, y: a.y * s, z: a.z * s }), plus = (...v: V[]): V => v.reduce((a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }));

const cross = (a: V, b: V): V => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }), clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x)), length = (a: V) => Math.hypot(a.x, a.y, a.z);

/**
 * Sketchbook's stabiliser: three.js' `Quaternion.setFromUnitVectors(from, to)`, all four components times 0.3, read
 * back as XYZ Euler angles and added to the angular velocity. A quaternion scaled like that is no longer a rotation,
 * so the angles are not 0.3 of the way; they are what three.js makes of it, and the feel depends on it. Same arithmetic here.
 */
function correction(from: V, to: V): V {
  let w = dot(from, to) + 1, v: V;
  if (w < 1e-6) { w = 0; v = Math.abs(from.x) > Math.abs(from.z) ? { x: -from.y, y: from.x, z: 0 } : { x: 0, y: -from.z, z: from.y }; } else v = cross(from, to);
  const n = 0.3 / (Math.hypot(v.x, v.y, v.z, w) || 1), x = v.x * n, y = v.y * n, z = v.z * n; w *= n;
  const m11 = 1 - 2 * (y * y + z * z), m12 = 2 * (x * y - w * z), m13 = 2 * (x * z + w * y), m22 = 1 - 2 * (x * x + z * z), m23 = 2 * (y * z - w * x), m32 = 2 * (y * z + w * x), m33 = 1 - 2 * (x * x + y * y);
  return Math.abs(m13) < 0.9999999 ? { x: Math.atan2(-m23, m33), y: Math.asin(clamp(m13, -1, 1)), z: Math.atan2(-m12, m11) } : { x: Math.atan2(m32, m22), y: Math.asin(clamp(m13, -1, 1)), z: 0 };
}

function chassis(R: typeof RAPIER, world: RAPIER.World, model: Model, pose: Mat34, mass: number, lift: number) {
  const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(pose[9], pose[10] + lift, pose[11]).setRotation(quaternionOf(pose)).setLinearDamping(0.01).setAngularDamping(0.01)); // cannon-es' defaults, which Sketchbook leaves alone
  const boxes = model.colliders.filter((c) => c.shape === "box"), volume = boxes.reduce((v, c) => v + (c.shape === "box" ? 8 * c.half[0] * c.half[1] * c.half[2] : 0), 0);
  for (const c of boxes) if (c.shape === "box") world.createCollider(R.ColliderDesc.cuboid(c.half[0], c.half[1], c.half[2]).setTranslation(c.at[0], c.at[1], c.at[2]).setDensity(mass / volume).setFriction(0.6), body);
  // The spheres are what it stands on (a helicopter's skid ends are four of them): weightless, but without them it sits down on its tail.
  for (const c of model.colliders) if (c.shape === "sphere") world.createCollider(R.ColliderDesc.ball(c.radius).setTranslation(c.at[0], c.at[1], c.at[2]).setDensity(0).setFriction(0.6), body);
  return body;
}
const stirring = (body: RAPIER.RigidBody) => !body.isSleeping() && (Math.hypot(body.linvel().x, body.linvel().y, body.linvel().z) > 0.03 || Math.hypot(body.angvel().x, body.angvel().y, body.angvel().z) > 0.03);
const UP: V = { x: 0, y: 1, z: 0 };

export function createHelicopter(R: typeof RAPIER, world: RAPIER.World, model: Model, pose: Mat34) {
  const body = chassis(R, world, model, pose, 700, 0.3);
  let spin = 0, power = 0;
  return {
    body, kind: "heli" as const,
    drive(input: Fly | null, dt: number): void {
      power = input ? Math.min(1, power + dt * 0.2) : Math.max(0, power - dt * 0.06);
      spin += power * dt * 30;
      if (power === 0) return;
      const k = dt * 60, a = axes(body.rotation());
      let v: V = body.linvel(), w: V = body.angvel();
      if (input?.up) v = plus(v, scaled(a.up, 0.15 * power * k));
      if (input?.down) v = plus(v, scaled(a.up, -0.15 * power * k));
      // vertical stabilisation: 98 % of gravity, along its own up, less as it tilts; and a little damping of the climb
      const hold = 9.81 * dt * 0.98 * Math.sqrt(clamp(a.up.y, 0, 1));
      v = plus(v, scaled(plus(scaled(a.up, hold), { x: 0, y: v.y * -0.01 * k, z: 0 }), power));
      const slow = 1 + (0.995 - 1) * power; v = { x: v.x * slow ** k, y: v.y, z: v.z * slow ** k };
      if (input) {
        w = plus(w, scaled(correction(a.up, UP), power * k)); // only while someone flies it
        w = plus(w, scaled(a.right, 0.07 * power * k * input.y), scaled(a.up, -0.07 * power * k * input.yaw), scaled(a.forward, 0.07 * power * k * input.x));
      }
      w = scaled(w, 0.97 ** k);
      body.setLinvel(v, true); body.setAngvel(w, true);
    },
    moving: () => power > 0 || stirring(body),
    pose: (): Mat34 => fromPose(body.translation(), body.rotation()),
    part: (p: Part): Mat34 | null => (p.role === "rotor" ? rotationX(spin * (p.name === "Cube.002" ? 1.7 : 1)) : null),
    power: () => power,
  };
}

export function createAeroplane(R: typeof RAPIER, world: RAPIER.World, model: Model, pose: Mat34) {
  const REST = 0.16, RADIUS = 0.11, body = chassis(R, world, model, pose, 520, 0.35), gear = world.createVehicleController(body);
  const wheels = model.parts.filter((p): p is Part & { rest: Mat34 } => p.role === "wheel" && !!p.rest);
  gear.indexUpAxis = 1; gear.setIndexForwardAxis = 2;
  wheels.forEach((w, i) => { gear.addWheel({ x: w.rest[9], y: w.rest[10] + REST, z: w.rest[11] }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, REST, RADIUS); gear.setWheelSuspensionStiffness(i, 60); gear.setWheelSuspensionCompression(i, 4); gear.setWheelSuspensionRelaxation(i, 5); gear.setWheelMaxSuspensionTravel(i, 0.12); gear.setWheelMaxSuspensionForce(i, 40_000); gear.setWheelFrictionSlip(i, 1.6); });
  const steering = new Spring(10, 0.6), aileron = new Spring(5, 0.6), elevator = new Spring(7, 0.6), rudder = new Spring(10, 0.6), SURFACE = 0.7;
  let spin = 0, power = 0, lastDrag = 0, grounded = 0;
  return {
    body, kind: "airplane" as const,
    drive(input: Fly | null, dt: number): void {
      power = input ? Math.min(1, power + dt * 0.4) : Math.max(0, power - dt * 0.12);
      spin += power * dt * 60;
      const left = !!input && (input.yaw < 0 || input.x < 0) && !(input.yaw > 0 || input.x > 0), right = !!input && (input.yaw > 0 || input.x > 0) && !(input.yaw < 0 || input.x < 0);
      steering.target = grounded > 0 ? (left ? 0.8 : right ? -0.8 : 0) : 0;
      aileron.target = -SURFACE * Math.sign(input?.x ?? 0); elevator.target = -SURFACE * Math.sign(input?.y ?? 0); rudder.target = -SURFACE * Math.sign(input?.yaw ?? 0);
      for (const s of [steering, aileron, elevator, rudder]) s.step();
      wheels.forEach((w, i) => { if (w.steering) gear.setWheelSteering(i, steering.position); gear.setWheelBrake(i, input ? (input.wheelBrake ? 12 : 0) : 2); });
      // Parked on three springs it never quite stops trembling, and a thing that trembles redraws the whole picture every
      // frame. With nobody in it and next to no speed, it is put to sleep. (Ours, not Sketchbook's: its picture is free.)
      if (!input && power === 0 && length(body.linvel()) < 0.25 && length(body.angvel()) < 0.25) { gear.updateVehicle(dt); body.sleep(); return; }
      const k = dt * 60, a = axes(body.rotation());
      let v: V = body.linvel(), w: V = body.angvel();
      const speed1 = length(v), forwardSpeed = dot(v, a.forward), flight = clamp(forwardSpeed / 10, 0, 1); // the controls bite with speed
      // the nose is turned towards where it is going; not backwards on the ground, and not against a pilot pulling a loop
      if (speed1 > 1e-6) {
        const turn = correction(a.forward, scaled(v, 1 / speed1)), influence = clamp(speed1 - 1, 0, 0.1) * (grounded > 0 && forwardSpeed < 0 ? 0 : 1) * k, loopFix = input?.up && forwardSpeed > 0 ? 0 : 1;
        w = plus(w, { x: turn.x * influence * loopFix, y: turn.y * influence, z: turn.z * influence * loopFix });
      }
      if (input) w = plus(w, scaled(a.right, 0.04 * flight * power * k * input.y), scaled(a.up, -0.02 * flight * power * k * input.yaw), scaled(a.forward, 0.055 * flight * power * k * input.x));
      const push = input?.up && !input.down ? 0.06 : input?.down && !input.up ? -0.05 : grounded > 0 ? 0 : 0.02;
      v = plus(v, scaled(a.forward, (speed1 * lastDrag + push * k) * power)); // last step's drag comes back along the nose
      const speed2 = length(v), drag = speed2 * 0.003 * power * k; v = scaled(v, 1 - drag); lastDrag = drag;
      v = plus(v, scaled(a.up, clamp(speed2 * 0.005 * power, 0, 0.05) * k)); // lift
      w = scaled(w, 1 + (0.98 ** k - 1) * flight);
      body.setLinvel(v, true); body.setAngvel(w, true);
      wheels.forEach((_, i) => gear.setWheelSuspensionStiffness(i, 60 * (1 - flight * 0.6)));
      gear.updateVehicle(dt);
      grounded = wheels.reduce((n, _, i) => n + (gear.wheelIsInContact(i) ? 1 : 0), 0);
    },
    moving: () => power > 0 || stirring(body),
    pose: (): Mat34 => fromPose(body.translation(), body.rotation()),
    part(p: Part): Mat34 | null {
      if (p.role === "rotor") return rotationX(spin);
      if (p.role === "aileron") return rotationY(p.side === "right" ? -aileron.position : aileron.position);
      if (p.role === "elevator") return rotationY(elevator.position);
      if (p.role === "rudder") return rotationY(rudder.position);
      const i = wheels.indexOf(p as Part & { rest: Mat34 });
      if (i < 0) return null;
      return compose([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, REST - (gear.wheelSuspensionLength(i) ?? REST), 0], compose(rotationY(gear.wheelSteering(i) ?? 0), rotationX(gear.wheelRotation(i) ?? 0)));
    },
    speed: () => dot(body.linvel(), axes(body.rotation()).forward),
    throttle: () => power,
    grounded: () => grounded,
  };
}
export type Helicopter = ReturnType<typeof createHelicopter>;
export type Aeroplane = ReturnType<typeof createAeroplane>;
