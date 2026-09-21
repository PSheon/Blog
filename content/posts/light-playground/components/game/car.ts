import type RAPIER from "@dimforge/rapier3d-compat";
import { compose, fromPose, rotationX, rotationY, type Mat34, type Model, type Part } from "@/lib/rt";

/**
 * A car: a rigid body shaped by the model's two boxes, on Rapier's ray-cast vehicle controller. Each wheel is a ray
 * cast down from the chassis with a spring on it; the wheels that are drawn are put where the rays end. The models
 * face +z, so that is forward.
 */
export interface Drive { /** −1 (reverse) … 1 */ throttle: number; /** −1 (right) … 1 (left) */ steer: number; brake: boolean }

const ENGINE = 2600, BRAKE = 60, MAX_STEER = 0.55, MASS = 900, REST = 0.28, TRAVEL = 0.2;

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
  let steering = 0;

  return {
    body,
    /** Before the world steps. */
    drive(input: Drive, dt: number): void {
      steering += (input.steer * MAX_STEER - steering) * Math.min(1, dt * 8);
      const v = body.linvel(), speed = Math.hypot(v.x, v.y, v.z), power = ENGINE * Math.max(0.25, 1 - speed / 32);
      wheels.forEach((w, i) => {
        if (w.steering) controller.setWheelSteering(i, steering);
        controller.setWheelEngineForce(i, w.drive === "fwd" || w.drive === "rwd" ? input.throttle * power * 0.5 : 0);
        controller.setWheelBrake(i, input.brake ? BRAKE : Math.abs(input.throttle) < 0.05 ? 1.5 : 0);
      });
      if (input.throttle || input.brake || input.steer) body.wakeUp();
      controller.updateVehicle(dt);
    },
    /** Is it (still) moving? A parked car that sleeps costs the picture nothing. */
    moving(): boolean { return !body.isSleeping() && (Math.hypot(body.linvel().x, body.linvel().y, body.linvel().z) > 0.03 || Math.hypot(body.angvel().x, body.angvel().y, body.angvel().z) > 0.03); },
    pose(): Mat34 { return fromPose(body.translation(), body.rotation()); },
    /** A wheel's own transform, in its rest frame: down its spring, turned by the steering, rolled by the distance. */
    wheel(part: Part): Mat34 | null {
      const i = wheels.indexOf(part as Part & { rest: Mat34 });
      if (i < 0) return null;
      const length = controller.wheelSuspensionLength(i) ?? REST, roll = controller.wheelRotation(i) ?? 0, steer = controller.wheelSteering(i) ?? 0;
      return compose([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, REST - length, 0], compose(rotationY(steer), rotationX(roll)));
    },
    speed(): number { const v = body.linvel(), q = body.rotation(), fz: [number, number, number] = [2 * (q.x * q.z + q.y * q.w), 2 * (q.y * q.z - q.x * q.w), 1 - 2 * (q.x * q.x + q.y * q.y)]; return v.x * fz[0] + v.y * fz[1] + v.z * fz[2]; },
    up(): number { const q = body.rotation(); return 1 - 2 * (q.x * q.x + q.z * q.z); },
  };
}
export type Car = ReturnType<typeof createCar>;
