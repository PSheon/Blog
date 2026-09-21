import type RAPIER from "@dimforge/rapier3d-compat";
import type { ClipName, Vec3 } from "@/lib/rt";

/**
 * The playground as a place with physics: Rapier (Apache-2.0) holds the ground as one triangle mesh and the character
 * as a capsule moved by its kinematic character controller. Nothing here draws; the figure asks where things are and
 * hands that to the renderer.
 */
export interface Input { /** the stick: x right, y forward, each −1…1 */ move: [number, number]; /** where the camera looks, radians about y */ yaw: number; jump: boolean; sprint: boolean }
export interface Person { at: Vec3; /** radians about y; 0 faces −z */ facing: number; clip: ClipName; clipTime: number; loop: boolean; moving: boolean }

const STEP = 1 / 60, WALK = 4, SPRINT = 7.5, JUMP = 6.2, GRAVITY = 18, HALF = 0.25, RADIUS = 0.25;

export async function createWorld(mesh: { vertices: Float32Array; indices: Uint32Array }, spawn: Vec3) {
  const R = (await import("@dimforge/rapier3d-compat")).default;
  await R.init();
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = STEP;
  world.createCollider(R.ColliderDesc.trimesh(mesh.vertices, mesh.indices));

  const body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn[0], spawn[1] + HALF + RADIUS + 0.3, spawn[2]));
  const capsule = world.createCollider(R.ColliderDesc.capsule(HALF, RADIUS), body), walker = world.createCharacterController(0.02);
  walker.enableAutostep(0.35, 0.15, false); walker.enableSnapToGround(0.3); walker.setMaxSlopeClimbAngle((50 * Math.PI) / 180); walker.setMinSlopeSlideAngle((60 * Math.PI) / 180);

  let pending = 0, vy = 0, grounded = false, facing = 0, clip: ClipName = "idle", clipTime = 0, airborne = 0, still = 1, wantJump = false;
  const person: Person = { at: [spawn[0], spawn[1], spawn[2]], facing: 0, clip, clipTime: 0, loop: true, moving: true };

  const tick = (input: Input) => {
    const [mx, my] = input.move, strength = Math.min(1, Math.hypot(mx, my)), sin = Math.sin(input.yaw), cos = Math.cos(input.yaw);
    // the stick is read in the camera's frame: forward is where the camera looks
    const dx = strength ? (sin * my + cos * mx) / Math.hypot(mx, my) : 0, dz = strength ? (-cos * my + sin * mx) / Math.hypot(mx, my) : 0, speed = strength * (input.sprint ? SPRINT : WALK);
    if (grounded && wantJump) { vy = JUMP; grounded = false; }
    wantJump = false;
    vy = grounded ? Math.max(vy, -1) - GRAVITY * STEP : vy - GRAVITY * STEP;
    walker.computeColliderMovement(capsule, { x: dx * speed * STEP, y: vy * STEP, z: dz * speed * STEP });
    const moved = walker.computedMovement(), was = body.translation();
    grounded = walker.computedGrounded();
    if (grounded && vy < 0) vy = 0;
    body.setNextKinematicTranslation({ x: was.x + moved.x, y: was.y + moved.y, z: was.z + moved.z });
    world.step();
    if (strength > 0.05) { const want = Math.atan2(dx, -dz); let turn = want - facing; turn = Math.atan2(Math.sin(turn), Math.cos(turn)); facing += turn * Math.min(1, STEP * 12); }
    airborne = grounded ? 0 : airborne + STEP; still = grounded && strength < 0.05 ? still + STEP : 0;
    const next: ClipName = airborne > 0.12 ? (vy > 1 ? (strength > 0.3 ? "jump_running" : "jump_idle") : "falling") : strength < 0.05 ? "idle" : input.sprint ? "sprint" : "run";
    if (next !== clip) { clip = next; clipTime = 0; } else clipTime += STEP;
    if (body.translation().y < -40) { body.setTranslation({ x: spawn[0], y: spawn[1] + 2, z: spawn[2] }, true); vy = 0; } // off the edge of the world: back to the start
    person.moving = still < 0.5; // half a second after stopping the pose has settled into idle, and the picture may start to clear
  };

  return {
    /** Advance by `dt` seconds of real time, in fixed steps. Returns whether anything a picture would show has changed. */
    step(dt: number, input: Input): boolean {
      if (input.jump) wantJump = true;
      pending = Math.min(pending + dt, 0.1);
      let stepped = false;
      while (pending >= STEP) { tick(input); pending -= STEP; stepped = true; }
      const t = body.translation();
      person.at = [t.x, t.y - HALF - RADIUS, t.z]; person.facing = facing; person.clip = clip; person.clipTime = clipTime; person.loop = clip === "idle" || clip === "run" || clip === "sprint" || clip === "falling";
      return stepped && person.moving;
    },
    person,
    /** How far a camera may pull back from `from` along unit `direction` before something is in the way. */
    clearance(from: Vec3, direction: Vec3, wanted: number): number {
      const hit = world.castRay(new R.Ray({ x: from[0], y: from[1], z: from[2] }, { x: direction[0], y: direction[1], z: direction[2] }), wanted, true, undefined, undefined, capsule);
      return hit ? Math.max(0.6, hit.timeOfImpact - 0.25) : wanted;
    },
    destroy(): void { world.free(); },
  };
}
export type World = Awaited<ReturnType<typeof createWorld>>;
export type { RAPIER };
