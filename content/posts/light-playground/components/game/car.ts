import type RAPIER from "@dimforge/rapier3d-compat";
import { compose, fromPose, rotationX, rotationY, rotationZ, type Mat34, type Model, type Part } from "@/lib/rt";

/**
 * Sketchbook's car (vehicles/Car.ts, MIT, Jan Blaha) on Rapier's ray-cast vehicle controller: a rigid body shaped by the
 * model's boxes, each wheel a ray cast down from the chassis with a spring on it. The models face +z, so that is forward.
 *
 * Ported: five gears that shift by themselves (0.2 s without drive at every shift), all-wheel drive, the brake on the rear
 * wheels, steering on a spring that is limited with speed and countersteers a slide (the angle between where the car
 * points and where it goes), spinning the car in the air with the same keys once it has been off the ground a while,
 * rolling a car that lies on its roof back over, and the steering wheel. Sketchbook's forces are for its 50 kg body; here
 * they are scaled to this one's mass. The suspension numbers are ours: the two physics engines' springs are not alike.
 */
export interface Drive { /** −1 (reverse) … 1 */ throttle: number; /** −1 (right) … 1 (left) */ steer: number; brake: boolean }

const MASS = 900, ENGINE = 500 * (MASS / 50), BRAKE = 60, MAX_STEER = 0.8, REST = 0.28, TRAVEL = 0.2, TIME_TO_SHIFT = 0.2, MAX_GEAR = 5, GEAR_SPEED = [0, 5, 9, 13, 17, 22], REVERSE_SPEED = -4, MAX_AIR_SPIN = 2, AIR_SPIN = 0.15;

/** Sketchbook's SpringSimulator at its 60 frames a second: one call is one frame. */
export class Spring { position = 0; velocity = 0; target = 0; constructor(private mass: number, private damping: number) {} step(): number { this.velocity += (this.target - this.position) / this.mass; this.velocity *= this.damping; return (this.position += this.velocity); } }

/** Column basis (not necessarily unit length) to a unit quaternion. */
export function quaternionOf(b: number[]): { x: number; y: number; z: number; w: number } {
  const n = (i: number) => Math.hypot(b[i], b[i + 1], b[i + 2]) || 1, m = [b[0] / n(0), b[1] / n(0), b[2] / n(0), b[3] / n(3), b[4] / n(3), b[5] / n(3), b[6] / n(6), b[7] / n(6), b[8] / n(6)];
  const trace = m[0] + m[4] + m[8];
  if (trace > 0) { const s = Math.sqrt(trace + 1) * 2; return { w: s / 4, x: (m[5] - m[7]) / s, y: (m[6] - m[2]) / s, z: (m[1] - m[3]) / s }; }
  if (m[0] > m[4] && m[0] > m[8]) { const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2; return { w: (m[5] - m[7]) / s, x: s / 4, y: (m[3] + m[1]) / s, z: (m[6] + m[2]) / s }; }
  if (m[4] > m[8]) { const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2; return { w: (m[6] - m[2]) / s, x: (m[3] + m[1]) / s, y: s / 4, z: (m[7] + m[5]) / s }; }
  const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2; return { w: (m[1] - m[3]) / s, x: (m[6] + m[2]) / s, y: (m[7] + m[5]) / s, z: s / 4 };
}

export function createCar(R: typeof RAPIER, world: RAPIER.World, model: Model, pose: Mat34) {
  const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(pose[9], pose[10] + 0.4, pose[11]).setRotation(quaternionOf(pose)).setCanSleep(true).setLinearDamping(0.05).setAngularDamping(0.4));
  const boxes = model.colliders.filter((c) => c.shape === "box"), volume = boxes.reduce((v, c) => v + (c.shape === "box" ? 8 * c.half[0] * c.half[1] * c.half[2] : 0), 0);
  for (const c of boxes) if (c.shape === "box") world.createCollider(R.ColliderDesc.cuboid(c.half[0], c.half[1], c.half[2]).setTranslation(c.at[0], c.at[1], c.at[2]).setDensity(MASS / volume).setFriction(0.4), body);
  const controller = world.createVehicleController(body), wheels = model.parts.filter((p): p is Part & { rest: Mat34 } => p.role === "wheel" && !!p.rest);
  controller.indexUpAxis = 1; controller.setIndexForwardAxis = 2;
  const radius = 0.23;
  wheels.forEach((w, i) => {
    controller.addWheel({ x: w.rest[9], y: w.rest[10] + REST, z: w.rest[11] }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, REST, radius);
    controller.setWheelSuspensionStiffness(i, 38); controller.setWheelSuspensionCompression(i, 3.2); controller.setWheelSuspensionRelaxation(i, 4.2); controller.setWheelMaxSuspensionTravel(i, TRAVEL); controller.setWheelMaxSuspensionForce(i, 60_000); controller.setWheelFrictionSlip(i, w.steering ? 2.2 : 2.6); controller.setWheelSideFrictionStiffness(i, 1);
  });
  const steering = new Spring(10, 0.6), initial = quaternionOf(pose);
  let gear = 1, shiftTimer = 0, airSpinTimer = 0, canTiltForwards = false, grounded = 0;
  const shift = (by: number) => { gear += by; shiftTimer = TIME_TO_SHIFT; };

  return {
    body,
    /** Before the world steps. */
    drive(input: Drive, dt: number): void {
      const throttle = input.throttle > 0.1, reverse = input.throttle < -0.1, left = input.steer > 0.1, right = input.steer < -0.1, k = dt * 60;
      const q = body.rotation(), forward = { x: 2 * (q.x * q.z + q.y * q.w), y: 2 * (q.y * q.z - q.x * q.w), z: 1 - 2 * (q.x * q.x + q.y * q.y) }, side = { x: 1 - 2 * (q.y * q.y + q.z * q.z), y: 2 * (q.x * q.y + q.z * q.w), z: 2 * (q.x * q.z - q.y * q.w) }, upY = 1 - 2 * (q.x * q.x + q.z * q.z);
      const v = body.linvel(), speed = v.x * forward.x + v.y * forward.y + v.z * forward.z, pace = Math.hypot(v.x, v.y, v.z);
      if (grounded === 0) { airSpinTimer += dt; if (!throttle) canTiltForwards = true; } else { canTiltForwards = false; airSpinTimer = 0; }

      // the engine and its gears: the force falls to nothing as the gear's top speed comes near, and then it shifts
      let engine = 0;
      if (shiftTimer > 0) shiftTimer = Math.max(0, shiftTimer - dt);
      else if (reverse) engine = -(ENGINE / gear) * Math.abs((REVERSE_SPEED - speed) / Math.abs(REVERSE_SPEED));
      else {
        const powerFactor = (GEAR_SPEED[gear] - speed) / (GEAR_SPEED[gear] - GEAR_SPEED[gear - 1]);
        if (powerFactor < 0.1 && gear < MAX_GEAR) shift(1); else if (gear > 1 && powerFactor > 1.2) shift(-1); else if (throttle) engine = (ENGINE / gear) * powerFactor * Math.min(1, Math.abs(input.throttle));
      }

      // in the air the keys spin it (fully after two seconds off the ground); lying on its roof and nearly still, left and right roll it over
      const airSpin = Math.min(1, airSpinTimer / 2) * Math.min(1, Math.max(0, speed)), flipOver = Math.min(1, Math.max(0, 1 - speed)) * (-upY / 2 + 0.5) * 3;
      let w = body.angvel(); const about = (axis: typeof forward, amount: number) => { w = { x: w.x + axis.x * amount, y: w.y + axis.y * amount, z: w.z + axis.z * amount }; }, spinning = (axis: typeof forward) => w.x * axis.x + w.y * axis.y + w.z * axis.z, before = w;
      if (right && !left) { if (spinning(forward) < MAX_AIR_SPIN) about(forward, AIR_SPIN * (airSpin + flipOver) * k); } else if (left && !right) { if (spinning(forward) > -MAX_AIR_SPIN) about(forward, -AIR_SPIN * (airSpin + flipOver) * k); }
      if (canTiltForwards && throttle && !reverse) { if (spinning(side) < MAX_AIR_SPIN) about(side, AIR_SPIN * airSpin * k); } else if (reverse && !throttle) { if (spinning(side) > -MAX_AIR_SPIN) about(side, -AIR_SPIN * airSpin * k); }
      if (w !== before) body.setAngvel(w, true);

      // steering: less lock with speed, and never less than it takes to point the wheels where the car is actually going
      let drift = 0;
      if (pace > 0.05) { const vx = v.x / pace, vy = v.y / pace, vz = v.z / pace, d = vx * forward.x + vy * forward.y + vz * forward.z; drift = d > 1 - 0.0005 ? 0 : Math.acos(Math.max(-1, d)); if (vz * forward.x - vx * forward.z < 0) drift = -drift; }
      const lock = MAX_STEER / Math.max(1, speed * 0.3), clamp = (x: number) => Math.min(MAX_STEER, Math.max(-MAX_STEER, x));
      steering.target = right ? clamp(Math.min(-lock, -drift)) : left ? clamp(Math.max(lock, -drift)) : 0;
      steering.step();

      wheels.forEach((w0, i) => {
        if (w0.steering) controller.setWheelSteering(i, steering.position);
        controller.setWheelEngineForce(i, engine); // all-wheel drive: every wheel gets the whole figure, as in Sketchbook
        controller.setWheelBrake(i, input.brake ? (w0.drive === "rwd" ? BRAKE : 0) : !throttle && !reverse ? 1.5 : 0); // the last is ours: a car nobody drives comes to rest, and a picture with nothing moving in it can clear
      });
      if (throttle || reverse || input.brake || left || right) body.wakeUp();
      // on fewer than three wheels and all but still, Sketchbook stands it up the way it was parked
      if (grounded < 3 && pace < 0.5 && upY < 0.5 && !body.isSleeping()) body.setRotation(initial, true);
      controller.updateVehicle(dt);
      grounded = wheels.reduce((n, _, i) => n + (controller.wheelIsInContact(i) ? 1 : 0), 0);
    },
    /** Is it (still) moving? A parked car that sleeps costs the picture nothing. */
    moving(): boolean { return !body.isSleeping() && (Math.hypot(body.linvel().x, body.linvel().y, body.linvel().z) > 0.03 || Math.hypot(body.angvel().x, body.angvel().y, body.angvel().z) > 0.03); },
    pose(): Mat34 { return fromPose(body.translation(), body.rotation()); },
    /** A wheel's own transform, in its rest frame: down its spring, turned by the steering, rolled by the distance. */
    wheel(part: Part): Mat34 | null {
      if (part.role === "steering_wheel") return rotationZ(-steering.position * 2);
      const i = wheels.indexOf(part as Part & { rest: Mat34 });
      if (i < 0) return null;
      const length = controller.wheelSuspensionLength(i) ?? REST, roll = controller.wheelRotation(i) ?? 0, steer = controller.wheelSteering(i) ?? 0;
      return compose([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, REST - length, 0], compose(rotationY(steer), rotationX(roll)));
    },
    speed(): number { const v = body.linvel(), q = body.rotation(), fz: [number, number, number] = [2 * (q.x * q.z + q.y * q.w), 2 * (q.y * q.z - q.x * q.w), 1 - 2 * (q.x * q.x + q.y * q.y)]; return v.x * fz[0] + v.y * fz[1] + v.z * fz[2]; },
    up(): number { const q = body.rotation(); return 1 - 2 * (q.x * q.x + q.z * q.z); },
    gear: () => gear,
    grounded: () => grounded,
  };
}
export type Car = ReturnType<typeof createCar>;
