import type RAPIER from "@dimforge/rapier3d-compat";
import { compose, fromPose, rotationY, type Boxman, type ClipName, type Mat34, type ModelName, type Models, type Part, type Seat, type Vec3 } from "@/lib/rt";
import { createAeroplane, createHelicopter, type Aeroplane, type Helicopter } from "./aircraft";
import { createCar, type Car } from "./car";
import { Character, type Keys, type Side, type Surroundings } from "./character";

/**
 * The playground as a place with physics: Rapier (Apache-2.0) holds the ground as one triangle mesh, the character as
 * a capsule moved by its kinematic character controller, and the vehicles as rigid bodies. What the character DOES is
 * Sketchbook's state machine (character.ts); this file gives it a body, a ground to feel, vehicles with doors and
 * seats, and turns its wishes (a speed, a facing, a jump) into movement. Nothing here draws.
 */
export interface Input { /** the stick: x right, y forward, each −1…1 */ move: [number, number]; /** where the camera looks, radians about y */ yaw: number; jump: boolean; sprint: boolean; /** get in or out (pressed this frame) */ interact: boolean; /** flying: Q −1 … E 1 (yaw), Shift (climb, throttle), Space (sink, air brake), B (the aeroplane's wheel brake) */ turn?: number; up?: boolean; down?: boolean; wheelBrake?: boolean }
export interface Person { /** where its feet are and how it stands, ready for the skinner */ place: Mat34; at: Vec3; clip: ClipName; clipTime: number; fade: number; loop: boolean; moving: boolean; state: string }
/** Something parked in the playground that can be got into: a car, the helicopter, the aeroplane. */
export interface Vehicle { name: ModelName; pose(): Mat34; /** a wheel's, a rotor's or a door's own movement */ part(part: Part): Mat34 | null; car: Car | null; craft: Helicopter | Aeroplane | null; body: RAPIER.RigidBody; moving(): boolean; seat: Seat; doors: Map<string, Door> }
interface Door { rotation: number; target: number; side: number }

const STEP = 1 / 60, MOVE_SPEED = 4, JUMP = 6.2, GRAVITY = 18, HALF = 0.25, RADIUS = 0.25, LOOPS = new Set<ClipName>(["idle", "run", "sprint", "falling", "driving", "sitting"]);
/** Sketchbook keeps a character's position at its capsule's middle, 0.57 above its feet, and gives door and seat heights for that point. */
const FEET = 0.57, ENTRY_UP = 0.53 - FEET, SEAT_UP = 0.6 - FEET;
/** detectRelativeSide: is `to` on the left (+x) of something at `from` that faces +z? */
const sideOf = (from: Vec3, to: Vec3): Side => (to[0] - from[0] > 0 ? "left" : "right");
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const apply = (m: Mat34, p: Vec3): Vec3 => [m[0] * p[0] + m[3] * p[1] + m[6] * p[2] + m[9], m[1] * p[0] + m[4] * p[1] + m[7] * p[2] + m[10], m[2] * p[0] + m[5] * p[1] + m[8] * p[2] + m[11]];
/** A world point in a rigid pose's own frame. */
const into = (m: Mat34, p: Vec3): Vec3 => { const d: Vec3 = [p[0] - m[9], p[1] - m[10], p[2] - m[11]]; return [m[0] * d[0] + m[1] * d[1] + m[2] * d[2], m[3] * d[0] + m[4] * d[1] + m[5] * d[2], m[6] * d[0] + m[7] * d[1] + m[8] * d[2]]; };
const yawOf = (m: Mat34) => Math.atan2(m[6], m[8]); // where its +z points, as an angle about y

export async function createWorld(mesh: { vertices: Float32Array; indices: Uint32Array }, spawn: Vec3, models: Models, parked: { name: ModelName; pose: Mat34 }[], man: Pick<Boxman, "clips">) {
  const R = (await import("@dimforge/rapier3d-compat")).default;
  await R.init();
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = STEP;
  world.createCollider(R.ColliderDesc.trimesh(mesh.vertices, mesh.indices));

  const body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn[0], spawn[1] + HALF + RADIUS + 0.3, spawn[2]));
  const capsule = world.createCollider(R.ColliderDesc.capsule(HALF, RADIUS), body), walker = world.createCharacterController(0.02);
  walker.enableAutostep(0.35, 0.15, false); walker.enableSnapToGround(0.3); walker.setMaxSlopeClimbAngle((50 * Math.PI) / 180); walker.setMinSlopeSlideAngle((60 * Math.PI) / 180);

  // ---- what is SHOWN lies between the last two physics steps. The physics runs at 60 steps a second whatever the display does;
  // a frame that falls between two steps shows a blend of them, or movement stutters whenever a frame has no step or two.
  type Snap = { p: { x: number; y: number; z: number }; q: { x: number; y: number; z: number; w: number } };
  const before = new Map<number, Snap>(), after = new Map<number, Snap>();
  let blend = 1;
  const shownPose = (b: RAPIER.RigidBody): Mat34 => {
    const a = before.get(b.handle), c = after.get(b.handle);
    if (!a || !c) return fromPose(b.translation(), b.rotation());
    const dot = a.q.x * c.q.x + a.q.y * c.q.y + a.q.z * c.q.z + a.q.w * c.q.w, sign = dot < 0 ? -1 : 1, t = blend;
    const q = { x: a.q.x + (sign * c.q.x - a.q.x) * t, y: a.q.y + (sign * c.q.y - a.q.y) * t, z: a.q.z + (sign * c.q.z - a.q.z) * t, w: a.q.w + (sign * c.q.w - a.q.w) * t }, l = Math.hypot(q.x, q.y, q.z, q.w) || 1;
    return fromPose({ x: a.p.x + (c.p.x - a.p.x) * t, y: a.p.y + (c.p.y - a.p.y) * t, z: a.p.z + (c.p.z - a.p.z) * t }, { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l });
  };
  const vehicles: Vehicle[] = parked.map(({ name, pose }) => {
    const model = models.models[name], seat = model.seats.find((s) => s.type === "driver") ?? model.seats[0], doors = new Map<string, Door>();
    for (const s of model.seats) { const part = model.parts.find((p) => p.name === s.door); if (part?.rest) doors.set(part.name, { rotation: 0, target: 0, side: sideOf(s.at, [part.rest[9], part.rest[10], part.rest[11]]) === "left" ? -1 : 1 }); }
    const door = (p: Part): Mat34 | null => { const d = doors.get(p.name); return d ? rotationY(d.side * d.rotation) : null; };
    if (name === "car") { const car = createCar(R, world, model, pose); return { name, car, craft: null, body: car.body, pose: () => shownPose(car.body), part: (p) => car.wheel(p) ?? door(p), moving: car.moving, seat, doors }; }
    const craft = name === "heli" ? createHelicopter(R, world, model, pose) : createAeroplane(R, world, model, pose);
    return { name, car: null, craft, body: craft.body, pose: () => shownPose(craft.body), part: (p) => craft.part(p) ?? door(p), moving: craft.moving, seat, doors };
  });
  // A spawn point is where Sketchbook's own physics wanted the thing; ours may find the ground a little higher, and a body that
  // starts inside the ground mesh is thrown about. So each vehicle is set down on whatever is under it, with its own clearance.
  world.step();
  for (const v of vehicles) {
    const at = v.body.translation(), ground = world.castRay(new R.Ray({ x: at.x, y: at.y + 4, z: at.z }, { x: 0, y: -1, z: 0 }), 12, true, undefined, undefined, undefined, v.body);
    if (ground) v.body.setTranslation({ x: at.x, y: at.y + 4 - ground.timeOfImpact + (v.name === "heli" ? 0.85 : 0.5), z: at.z }, true);
  }

  // ---- the character: what it wants (character.ts) and what happens to it (here)
  let pending = 0, vy = 0, grounded = false, impact = 0, facing = 0, facingTarget = 0, air: [number, number] = [0, 0], horizontal = 0, turn = 0, doorsMoving = false;
  let target: { vehicle: Vehicle; seat: Seat; entry: Vec3; since: number } | null = null; // walking to a vehicle's door
  let inside: { vehicle: Vehicle; /** the seat it is in or on its way into; a passenger's only until it has slid over */ seat: Seat; entry: Vec3; from: Vec3; fromYaw: number; seated: boolean } | null = null; // attached to a vehicle: from the door to the seat and back
  const last = { jump: false, run: false, direction: false, enter: false }, doorOf = (v: Vehicle, seat: Seat) => (seat.door ? v.doors.get(seat.door) ?? null : null);
  let stick: [number, number] = [0, 0];

  const surroundings: Surroundings = {
    get grounded() { return grounded; }, get speed() { return horizontal; }, get impact() { return impact; }, get turn() { return turn; },
    clipLength: (clip) => man.clips[clip]?.duration ?? 0.5,
    get vehicle() {
      const v = inside?.vehicle ?? target?.vehicle;
      if (!v) return null;
      const seat = inside?.seat ?? target?.seat ?? v.seat, entry = inside?.entry ?? target?.entry ?? seat.at, door = doorOf(v, seat), part = models.models[v.name].parts.find((p) => p.name === seat.door), lv = v.body.linvel();
      return { airplane: v.name === "airplane", hasDoor: !!door, doorOpen: !!door && door.rotation > 0 && door.target === door.rotation, side: sideOf(entry, seat.at), exitSide: sideOf(seat.at, entry), doorSide: part?.rest ? sideOf(seat.at, [part.rest[9], part.rest[10], part.rest[11]]) : "left", driverSeat: seat === v.seat, shiftSide: sideOf(seat.at, v.seat.at), speed: Math.hypot(lv.x, lv.y, lv.z), open: () => { if (door) door.target = 1; }, close: () => { if (door) door.target = 0; }, noDirection: Math.hypot(stick[0], stick[1]) < 0.05 };
    },
    jump: (speed) => { vy = speed > 0 ? Math.max(JUMP * 0.85, speed) : JUMP; grounded = false; },
    seated: () => { if (inside) inside.seated = true; },
    shifted: () => { if (inside) { const v = inside.vehicle; inside.seat = v.seat; inside.entry = v.seat.entries[0]?.at ?? inside.entry; } }, // from now on the driver's seat, door and way out
    released: (to) => {
      if (!inside) { character.enter("Idle"); return; }
      const v = inside.vehicle, m = v.pose(), lv = v.body.linvel(), at = apply(m, character.state === "ExitingAirplane" ? [inside.seat.at[0], inside.seat.at[1] + SEAT_UP + 1, inside.seat.at[2]] : [inside.entry[0], inside.entry[1] + ENTRY_UP, inside.entry[2]]);
      body.setTranslation({ x: at[0], y: at[1] + HALF + RADIUS, z: at[2] }, true); capsule.setEnabled(true);
      facing = facingTarget = Math.PI - yawOf(m); vy = lv.y; air = [lv.x, lv.z]; character.velocity.position = character.velocity.velocity = 0;
      const ground = world.castRay(new R.Ray({ x: at[0], y: at[1] + 0.5, z: at[2] }, { x: 0, y: -1, z: 0 }), 1.2, true, undefined, undefined, capsule, v.body);
      const next = to === "Falling" || !ground ? "Falling" : to;
      if (next !== "CloseVehicleDoorOutside") { target = null; inside = null; } else { target = { vehicle: v, seat: inside.seat, entry: inside.entry, since: 0 }; inside = null; } // closing the door still needs to know whose door
      character.enter(next);
    },
    cancelEntry: () => { target = null; },
  };
  const character = new Character(surroundings);
  const person: Person = { place: [1, 0, 0, 0, 1, 0, 0, 0, 1, ...spawn], at: [...spawn], clip: "idle", clipTime: 0, fade: 0.1, loop: true, moving: true, state: "Idle" };
  type Stance = { kind: "foot" | "inside"; at: Vec3; facing: number; lean: number; local: Vec3; yaw: number; vehicle: Vehicle | null };
  const now: Stance = { kind: "foot", at: [...spawn], facing: 0, lean: 0, local: [0, 0, 0], yaw: 0, vehicle: null };
  let was: Stance = { ...now };
  let still = 1, shown: ClipName = "idle", shownAt = 0;
  const latched = { interact: false, jump: false };

  const nearest = (reach: number): Vehicle | null => { const t = body.translation(); let best: Vehicle | null = null, d = reach; for (const v of vehicles) { const p = v.body.translation(), dist = Math.hypot(p.x - t.x, p.y - t.y, p.z - t.z); if (dist < d) { d = dist; best = v; } } return best; };

  const tick = (input: Input) => {
    stick = input.move;
    const strength = Math.min(1, Math.hypot(input.move[0], input.move[1])), direction = strength > 0.05;
    const keys: Keys = { anyDirection: direction, justDirection: direction && !last.direction, run: input.sprint, justRun: input.sprint && !last.run, justJump: input.jump && !last.jump, justEnter: input.interact && !last.enter };
    last.jump = input.jump; last.run = input.sprint; last.direction = direction; last.enter = false; // `interact` is a press, already one step long

    // F on foot: find a vehicle (Sketchbook looks 10 m around), and its driver's nearest entry point; the character then walks there by itself
    if (keys.justEnter && !inside && character.canFindVehicles) {
      const v = nearest(10);
      if (v) { // the driver's seat, or a passenger seat one can slide over from, whichever door is nearer (Sketchbook's findVehicleToEnter)
        const t = body.translation(), m = v.pose(), seats = models.models[v.name].seats.filter((s) => s === v.seat || s.connected.includes(v.seat.name));
        let seat = v.seat, best = v.seat.entries[0]?.at ?? v.seat.at, d = Infinity;
        for (const s of seats) for (const e of s.entries) { const w = apply(m, e.at), dist = Math.hypot(w[0] - t.x, w[2] - t.z); if (dist < d) { d = dist; best = e.at; seat = s; } }
        target = { vehicle: v, seat, entry: best, since: 0 };
      }
    }

    // the vehicles: whoever is driven gets the stick; doors swing (5 rad/s) to where they were told
    doorsMoving = false;
    const driven = inside?.seated ? inside.vehicle : null;
    for (const v of vehicles) {
      if (v.car && (v === driven || v.car.moving())) v.car.drive(v === driven ? { throttle: input.move[1], steer: -input.move[0], brake: input.jump || input.sprint } : { throttle: 0, steer: 0, brake: false }, STEP);
      if (v.craft && (v === driven || v.craft.moving())) v.craft.drive(v === driven ? { x: Math.max(-1, Math.min(1, input.move[0])), y: Math.max(-1, Math.min(1, input.move[1])), yaw: Math.max(-1, Math.min(1, input.turn ?? 0)), up: !!input.up, down: !!input.down, wheelBrake: !!input.wheelBrake } : null, STEP);
      for (const d of v.doors.values()) if (d.rotation !== d.target) { doorsMoving = true; d.rotation = d.rotation < d.target ? Math.min(d.target, d.rotation + 5 * STEP) : Math.max(d.target, d.rotation - 5 * STEP); }
    }

    // ---- attached to a vehicle: the states move the character between the door and the seat, in the vehicle's own frame
    if (inside) {
      character.update(STEP, keys);
      world.step();
      if (inside) {
        const v = inside.vehicle, s = character.state, entry: Vec3 = [inside.entry[0], inside.entry[1] + ENTRY_UP, inside.entry[2]], seat: Vec3 = [inside.seat.at[0], inside.seat.at[1] + SEAT_UP, inside.seat.at[2]], wheel: Vec3 = [v.seat.at[0], v.seat.at[1] + SEAT_UP, v.seat.at[2]];
        const local = s === "OpenVehicleDoor" ? lerp(inside.from, entry, character.progress) : s === "EnteringVehicle" ? lerp(entry, seat, character.progress) : s === "ExitingVehicle" ? lerp(seat, entry, character.progress) : s === "ExitingAirplane" ? lerp(seat, [seat[0], seat[1] + 1, seat[2]], character.progress) : s === "SwitchingSeats" ? lerp(seat, wheel, character.progress) : seat;
        const yaw = s === "OpenVehicleDoor" ? inside.fromYaw * (1 - character.progress) : 0, m = v.pose();
        now.kind = "inside"; now.local = local; now.yaw = yaw; now.vehicle = v;
        const at = apply(m, local); body.setTranslation({ x: at[0], y: at[1] + HALF + RADIUS, z: at[2] }, false);
        person.moving = s !== "Driving" || v.moving() || doorsMoving;
      }
      return;
    }

    // ---- on foot
    let mx = input.move[0], my = input.move[1], yaw = input.yaw;
    if (target && character.state !== "CloseVehicleDoorOutside") { // walking to the door by itself: the stick is overridden, in world terms
      const t = body.translation(), goal = apply(target.vehicle.pose(), target.entry), dx = goal[0] - t.x, dz = goal[2] - t.z, dist = Math.hypot(dx, dz);
      target.since += STEP; // (walking into a corner of the vehicle, or too long on the way: it gets in from where it stands)
      if ((dist < 0.2 || (dist < 1.6 && target.since > 1 && horizontal < 0.4) || target.since > 3.5) && character.canEnterVehicles && Math.abs(goal[1] - (t.y - HALF - RADIUS)) < 2) {
        const m = target.vehicle.pose(), feet: Vec3 = [t.x, t.y - HALF - RADIUS, t.z], door = doorOf(target.vehicle, target.seat);
        let relative = Math.PI - facing - yawOf(m); relative = Math.atan2(Math.sin(relative), Math.cos(relative)); // how the model is turned, seen from the vehicle
        inside = { vehicle: target.vehicle, seat: target.seat, entry: target.entry, from: into(m, feet), fromYaw: relative, seated: false }; target = null;
        capsule.setEnabled(false); vy = 0;
        character.enter(door && door.rotation < 0.5 ? "OpenVehicleDoor" : "EnteringVehicle");
        if (!door) inside.from = [inside.entry[0], inside.entry[1] + ENTRY_UP, inside.entry[2]];
        return;
      }
      mx = 0; my = 1; yaw = Math.atan2(dx, -dz);
    }
    const walking = target ? true : direction, sin = Math.sin(yaw), cos = Math.cos(yaw), n = Math.hypot(mx, my) || 1, wantX = walking ? (sin * my + cos * mx) / n : 0, wantZ = walking ? (-cos * my + sin * mx) / n : 0;
    const want = Math.atan2(wantX, -wantZ);
    // Left positive, as Sketchbook measures it. With the stick let go it is the angle still to go to where it last pointed: a flick
    // sideways lets go long before the turn is done, and that is when the turn-on-the-spot clips are chosen.
    const aim = walking ? want : facingTarget; turn = Math.atan2(Math.sin(facing - aim), Math.cos(facing - aim));
    character.update(STEP, target ? { ...keys, anyDirection: true, justDirection: keys.justDirection } : keys);
    if (inside) return; // a state change may have taken it off its feet

    // the two springs: how fast (along where it faces) and where it faces
    character.velocity.target = character.velocityTarget; const forward = character.velocity.step();
    // Sketchbook's RelativeSpringSimulator: the angle still to go is the pull, every frame anew. The target is where the stick
    // LAST pointed: letting go in the middle of a turn does not stop the turn (that is what the turn-on-the-spot clips are for).
    if (character.steers && walking) facingTarget = want;
    const toGo = Math.atan2(Math.sin(facingTarget - facing), Math.cos(facingTarget - facing));
    character.rotation.velocity = (character.rotation.velocity + toGo / character.rotation.mass) * character.rotation.damping; facing += character.rotation.velocity;
    const arcade: [number, number] = [Math.sin(facing) * forward * MOVE_SPEED, -Math.cos(facing) * forward * MOVE_SPEED];
    if (grounded) air = arcade; else air = [air[0] + (arcade[0] - air[0]) * character.airInfluence, air[1] + (arcade[1] - air[1]) * character.airInfluence];
    vy = grounded ? Math.max(vy, -1) - GRAVITY * STEP : vy - GRAVITY * STEP;
    walker.computeColliderMovement(capsule, { x: air[0] * STEP, y: vy * STEP, z: air[1] * STEP });
    const moved = walker.computedMovement(), was = body.translation(), wasGrounded = grounded;
    grounded = walker.computedGrounded() && vy <= 0.5;
    if (grounded && !wasGrounded) impact = vy / Math.sqrt(GRAVITY / 9.81); // Sketchbook's landing thresholds are for its gravity; ours is stronger, so the same fall arrives faster
    if (grounded && vy < 0) vy = 0;
    horizontal = Math.hypot(moved.x, moved.z) / STEP;
    body.setNextKinematicTranslation({ x: was.x + moved.x, y: was.y + moved.y, z: was.z + moved.z });
    world.step();
    if (body.translation().y < -40) { body.setTranslation({ x: spawn[0], y: spawn[1] + 2, z: spawn[2] }, true); vy = 0; } // off the edge of the world: back to the start
    const t = body.translation();
    // It leans into its turns, as Sketchbook's does: by the turning rate times the speed as a share of the move speed (not metres a second), and sinks a little as it leans.
    now.kind = "foot"; now.at = [t.x, t.y - HALF - RADIUS, t.z]; now.facing = facing; now.lean = Math.max(-0.6, Math.min(0.6, character.rotation.velocity * 2.3 * Math.abs(forward)));
    still = character.state === "Idle" && grounded ? still + STEP : 0;
    person.moving = still < 0.5 || doorsMoving; // half a second into Idle the pose has settled, and the picture may start to clear
  };

  return {
    /** Advance by `dt` seconds of real time, in fixed steps. Returns whether anything a picture would show has changed. */
    step(dt: number, input: Input): boolean {
      // A press lasts one frame of the page, and at 120 Hz not every frame has a physics step in it: keep presses until a step has seen them.
      if (input.interact) latched.interact = true;
      if (input.jump) latched.jump = true;
      pending = Math.min(pending + dt, 0.1);
      while (pending >= STEP) {
        was = { ...now, at: [...now.at], local: [...now.local] };
        for (const v of vehicles) { const c = after.get(v.body.handle); if (c) before.set(v.body.handle, c); }
        tick({ ...input, interact: latched.interact, jump: input.jump || latched.jump }); latched.interact = latched.jump = false;
        for (const v of vehicles) after.set(v.body.handle, { p: { ...v.body.translation() }, q: { ...v.body.rotation() } }); pending -= STEP; if (character.clip !== shown) { shown = character.clip; shownAt = 0; } else shownAt += STEP; }
      blend = pending / STEP;
      if (now.kind === "inside" && now.vehicle) { // in a vehicle's frame: the vehicle's shown pose carries it
        const same = was.kind === "inside" && was.vehicle === now.vehicle, local = same ? lerp(was.local, now.local, blend) : now.local, yaw = same ? was.yaw + (now.yaw - was.yaw) * blend : now.yaw, m = now.vehicle.pose();
        person.place = compose(m, compose([1, 0, 0, 0, 1, 0, 0, 0, 1, ...local], rotationY(yaw))); person.at = apply(m, local);
      } else {
        const same = was.kind === "foot", at = same ? lerp(was.at, now.at, blend) : now.at, turnBy = Math.atan2(Math.sin(now.facing - was.facing), Math.cos(now.facing - was.facing)), f = same ? was.facing + turnBy * blend : now.facing, lean = same ? was.lean + (now.lean - was.lean) * blend : now.lean;
        const c = Math.cos(lean), sn = Math.sin(lean), roll: Mat34 = [c, sn, 0, -sn, c, 0, 0, 0, 1, 0, 0, 0];
        person.at = at; person.place = compose([1, 0, 0, 0, 1, 0, 0, 0, 1, at[0], at[1] + (Math.cos(Math.abs(lean)) - 1) / 2, at[2]], compose(rotationY(Math.PI - f), roll));
      }
      person.clip = shown; person.clipTime = shownAt + pending; person.fade = character.fade; person.loop = LOOPS.has(shown); person.state = character.state;
      return person.moving || vehicles.some((v) => v.moving()); // also on a frame without a step: what is shown has moved on between two steps
    },
    person,
    vehicles,
    /** The vehicle the character is in (from the moment it is attached to one), or null on foot. */
    driving: () => inside?.vehicle ?? null,
    /** Is it in the seat, with the controls? */
    seated: () => !!inside?.seated,
    /** Something close enough to get into, or null. */
    nearby: () => (inside || target ? null : nearest(10)),
    /** How far a camera may pull back from `from` along unit `direction` before something is in the way. */
    clearance(from: Vec3, direction: Vec3, wanted: number): number {
      const hit = world.castRay(new R.Ray({ x: from[0], y: from[1], z: from[2] }, { x: direction[0], y: direction[1], z: direction[2] }), wanted, true, undefined, undefined, capsule, inside?.vehicle.body);
      return hit ? Math.max(0.6, hit.timeOfImpact - 0.25) : wanted;
    },
    /** Put the character somewhere else (on foot). */
    teleport(to: Vec3): void { if (inside) { capsule.setEnabled(true); inside = null; } target = null; character.enter("Idle"); body.setTranslation({ x: to[0], y: to[1] + HALF + RADIUS + 0.05, z: to[2] }, true); vy = 0; still = 0; now.kind = "foot"; now.at = [...to]; was = { ...now, at: [...to], local: [...now.local] }; facingTarget = facing; },
    destroy(): void { world.free(); },
  };
}
export type World = Awaited<ReturnType<typeof createWorld>>;
export type { RAPIER };
