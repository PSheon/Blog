import type { ClipName } from "@/lib/rt";

/**
 * The character's states, ported from Sketchbook (Jan Blaha / swift502, MIT: src/ts/characters/character_states). Same
 * states, same transitions, same numbers: the clip each state plays, how long it lasts, what the velocity and rotation
 * springs are set to, when the jump leaves the ground, how hard a landing has to be for a roll. What is not here is the
 * physics (Rapier moves the body; this only says how fast it wants to go and where it wants to face). A passenger seat is
 * only ever a way in: reached from the passenger's side, the character sits down there and slides over to the wheel, as
 * Sketchbook's does when it wants to drive.
 *
 * The file knows nothing of Rapier or the renderer, so that a test can walk it through its states.
 */
export type StateName =
  | "Idle" | "IdleRotateLeft" | "IdleRotateRight" | "StartWalkForward" | "StartWalkLeft" | "StartWalkRight" | "StartWalkBackLeft" | "StartWalkBackRight" | "Walk" | "Sprint" | "EndWalk"
  | "JumpIdle" | "JumpRunning" | "Falling" | "DropIdle" | "DropRunning" | "DropRolling"
  | "OpenVehicleDoor" | "EnteringVehicle" | "Sitting" | "SwitchingSeats" | "Driving" | "CloseVehicleDoorInside" | "ExitingVehicle" | "ExitingAirplane" | "CloseVehicleDoorOutside";

/** What the keys say this step. `justX`: went down since the last step. */
export interface Keys { anyDirection: boolean; justDirection: boolean; run: boolean; justRun: boolean; justJump: boolean; justEnter: boolean; /** G: get in as a passenger (the world reads it) */ justPassenger?: boolean; /** X: slide over to the connected seat */ justSwitch?: boolean }
/** Which side of the vehicle, as Sketchbook's detectRelativeSide names it. */
export type Side = "left" | "right";
/** What the states need to know about the world, and what they ask of it. */
export interface Surroundings {
  grounded: boolean;
  /** horizontal speed, m/s */
  speed: number;
  /** vertical velocity when the ground was last touched, m/s (negative: downwards) */
  impact: number;
  /** signed angle from where the character faces to where the stick points, radians, left positive */
  turn: number;
  clipLength(clip: ClipName): number;
  /** the vehicle being entered or sat in, if any */
  vehicle: { airplane: boolean; hasDoor: boolean; doorOpen: boolean; /** the seat, seen from the entry point */ side: Side; /** the entry point, seen from the seat */ exitSide: Side; /** the door, seen from the seat */ doorSide: Side; /** is the seat it is in (or getting into) the driver's */ driverSeat: boolean; /** the seat it slides over to, seen from this one */ shiftSide: Side; /** it got in to drive (F), so from a passenger's seat it slides over by itself */ wantsToDrive: boolean; /** this seat is connected to another */ canSwitch: boolean; speed: number; open(): void; close(): void; noDirection: boolean } | null;
  /** leave the ground with this vertical speed */
  jump(speed: number): void;
  /** the character is now in the driver's seat, with the controls */
  seated(): void;
  /** it lets go of the controls (it is about to slide over to a passenger's seat) */
  unseated(): void;
  /** about to slide over: to the driver's seat, or to the first seat connected to this one (Sketchbook's connectedSeats[0]) */
  beginShift(toDriver: boolean): void;
  /** it has slid over: its seat is now the one it slid to */
  shifted(): void;
  released(to: "Falling" | "DropRolling" | "Idle" | "CloseVehicleDoorOutside"): void;
  /** abandon the way into a vehicle */
  cancelEntry(): void;
}

/** Sketchbook's spring (SpringSimulator at 60 frames a second): a mass pulled to a target, damped each frame. */
export class Spring {
  position = 0; velocity = 0; target = 0;
  constructor(public mass: number, public damping: number) {}
  step(): number { this.velocity += (this.target - this.position) / this.mass; this.velocity *= this.damping; this.position += this.velocity; return this.position; }
}

const DEFAULTS = { velocityMass: 50, velocityDamping: 0.8, rotationMass: 10, rotationDamping: 0.5 };
const ease = (x: number) => -(Math.cos(Math.PI * x) - 1) / 2;

export class Character {
  state: StateName = "Idle";
  timer = 0;
  clip: ClipName = "idle";
  /** seconds over which the clip fades in */
  fade = 0.1;
  /** the state's clip length, where the state ends with its clip */
  length = 0;
  /** how fast it wants to go, as a share of the move speed (0.8 walks, 1.4 sprints), smoothed by `velocity` */
  velocityTarget = 0;
  readonly velocity = new Spring(DEFAULTS.velocityMass, DEFAULTS.velocityDamping);
  readonly rotation = new Spring(DEFAULTS.rotationMass, DEFAULTS.rotationDamping);
  /** may the stick turn the character in this state */
  steers = false;
  /** in the air, how much of the wanted velocity is added to the velocity it left the ground with, per step */
  airInfluence = 0;
  canFindVehicles = true; canEnterVehicles = false; canLeaveVehicles = true;
  /** 0…1 along the way of a vehicle state (door → seat, seat → ground), eased; the world places the body by it */
  progress = 0;
  /** the spring that pulls the character from where it stood to the entry point, and turns it to face the vehicle */
  readonly approach = new Spring(10, 0.5);
  private jumped = false; private opened = false; private closed = false;

  constructor(private readonly world: Surroundings) { this.enter("Idle"); }

  private play(clip: ClipName, fade: number): void { this.clip = clip; this.fade = fade; this.length = this.world.clipLength(clip); }
  private ended(step: number): boolean { return this.timer > this.length - step; }

  enter(state: StateName): void {
    this.state = state; this.timer = 0; this.jumped = this.opened = this.closed = false; this.progress = 0;
    this.velocity.mass = DEFAULTS.velocityMass; this.velocity.damping = DEFAULTS.velocityDamping; this.rotation.mass = DEFAULTS.rotationMass; this.rotation.damping = DEFAULTS.rotationDamping;
    this.steers = false; this.airInfluence = 0; this.canFindVehicles = true; this.canEnterVehicles = false; this.canLeaveVehicles = true;
    const v = this.world.vehicle;
    switch (state) {
      case "Idle": this.velocity.damping = 0.6; this.velocity.mass = 10; this.velocityTarget = 0; this.play("idle", 0.1); break;
      case "IdleRotateLeft": case "IdleRotateRight": this.rotation.mass = 30; this.rotation.damping = 0.6; this.velocity.damping = 0.6; this.velocity.mass = 10; this.velocityTarget = 0; this.steers = true; this.play(state === "IdleRotateLeft" ? "rotate_left" : "rotate_right", 0.1); break;
      case "StartWalkForward": case "StartWalkLeft": case "StartWalkRight": case "StartWalkBackLeft": case "StartWalkBackRight":
        this.canEnterVehicles = true; this.rotation.mass = 20; this.rotation.damping = 0.7; this.velocityTarget = 0.8; this.steers = true;
        this.play(({ StartWalkForward: "start_forward", StartWalkLeft: "start_left", StartWalkRight: "start_right", StartWalkBackLeft: "start_back_left", StartWalkBackRight: "start_back_right" } as const)[state], 0.1); break;
      case "Walk": this.canEnterVehicles = true; this.velocityTarget = 0.8; this.steers = true; this.play("run", 0.1); break;
      case "Sprint": this.canEnterVehicles = true; this.velocity.mass = 10; this.rotation.damping = 0.8; this.rotation.mass = 50; this.velocityTarget = 1.4; this.steers = true; this.play("sprint", 0.1); break;
      case "EndWalk": this.velocityTarget = 0; this.play("stop", 0.1); break;
      case "JumpIdle": this.velocity.mass = 50; this.velocityTarget = 0; this.play("jump_idle", 0.1); break;
      case "JumpRunning": this.velocity.mass = 100; this.steers = true; this.play("jump_running", 0.03); break;
      case "Falling": this.velocity.mass = 100; this.rotation.damping = 0.3; this.airInfluence = 0.05; this.steers = true; this.play("falling", 0.3); break;
      case "DropIdle": this.velocity.damping = 0.5; this.velocity.mass = 7; this.velocityTarget = 0; this.steers = true; this.play("drop_idle", 0.1); break;
      case "DropRunning": this.velocityTarget = 0.8; this.steers = true; this.play("drop_running", 0.1); break;
      case "DropRolling": this.velocity.mass = 1; this.velocity.damping = 0.6; this.velocityTarget = 0.8; this.steers = true; this.play("drop_running_roll", 0.03); break;
      case "OpenVehicleDoor": this.canFindVehicles = false; this.velocityTarget = 0; this.velocity.position = this.velocity.velocity = 0; this.approach.position = this.approach.velocity = 0; this.approach.target = 1; this.play(v?.side === "left" ? "open_door_standing_left" : "open_door_standing_right", 0.1); break;
      case "EnteringVehicle": this.canFindVehicles = false; this.velocityTarget = 0; this.velocity.position = this.velocity.velocity = 0; this.approach.target = 1; this.play(v?.airplane ? (v.side === "left" ? "enter_airplane_left" : "enter_airplane_right") : v?.side === "left" ? "sit_down_left" : "sit_down_right", 0.1); break;
      case "Sitting": this.canFindVehicles = false; this.play("sitting", 0.1); break;
      case "SwitchingSeats": this.canFindVehicles = false; this.canLeaveVehicles = false; this.play(v?.shiftSide === "left" ? "sitting_shift_left" : "sitting_shift_right", 0.1); break;
      case "Driving": this.canFindVehicles = false; this.play("driving", 0.1); break;
      case "CloseVehicleDoorInside": this.canFindVehicles = false; this.canLeaveVehicles = false; this.play(v?.doorSide === "left" ? "close_door_sitting_left" : "close_door_sitting_right", 0.1); v?.open(); break;
      case "ExitingVehicle": this.canFindVehicles = false; v?.open(); this.play(v?.exitSide === "left" ? "stand_up_left" : "stand_up_right", 0.1); break;
      case "ExitingAirplane": this.canFindVehicles = false; this.play("jump_idle", 0.1); break;
      case "CloseVehicleDoorOutside": this.canFindVehicles = false; this.play(v?.doorSide === "left" ? "close_door_standing_right" : "close_door_standing_left", 0.1); break;
    }
  }

  private startWalk(): void {
    const a = this.world.turn, range = Math.PI;
    this.enter(a > range * 0.8 ? "StartWalkBackLeft" : a < -range * 0.8 ? "StartWalkBackRight" : a > range * 0.3 ? "StartWalkLeft" : a < -range * 0.3 ? "StartWalkRight" : "StartWalkForward");
  }
  private drop(keys: Keys): void {
    if (this.world.impact < -6) this.enter("DropRolling");
    else if (keys.anyDirection) this.enter(this.world.impact < -2 ? "DropRunning" : keys.run ? "Sprint" : "Walk");
    else this.enter("DropIdle");
  }

  /** One step of 1/60 s. Input first (Sketchbook's onInputChange), then the state's own update. */
  update(step: number, keys: Keys): void {
    const w = this.world, s = this.state, onFoot = !s.includes("Vehicle") && s !== "Driving" && s !== "ExitingAirplane";
    this.timer += step;
    // a direction pressed on the way into a vehicle calls it off
    if (this.canEnterVehicles && keys.justDirection) w.cancelEntry();

    switch (s) {
      case "Idle": case "IdleRotateLeft": case "IdleRotateRight":
        if (keys.justJump) { this.enter("JumpIdle"); break; }
        if (keys.anyDirection) { if (w.speed > 0.5) this.enter("Walk"); else this.startWalk(); break; }
        if (s !== "Idle" && this.ended(step)) { this.enter("Idle"); break; }
        break;
      case "StartWalkForward": case "StartWalkLeft": case "StartWalkRight": case "StartWalkBackLeft": case "StartWalkBackRight":
        if (keys.justJump) { this.enter("JumpRunning"); break; }
        if (!keys.anyDirection) { if (this.timer < 0.1) this.enter(w.turn > Math.PI * 0.4 ? "IdleRotateLeft" : w.turn < -Math.PI * 0.4 ? "IdleRotateRight" : "Idle"); else this.enter("Idle"); break; }
        if (keys.justRun) { this.enter("Sprint"); break; }
        if (this.ended(step)) this.enter("Walk");
        break;
      case "Walk":
        if (keys.run) { this.enter("Sprint"); break; }
        if (keys.justJump) { this.enter("JumpRunning"); break; }
        if (!keys.anyDirection) this.enter(w.speed > 1 ? "EndWalk" : "Idle");
        break;
      case "Sprint":
        if (!keys.run) { this.enter("Walk"); break; }
        if (keys.justJump) { this.enter("JumpRunning"); break; }
        if (!keys.anyDirection) this.enter("EndWalk");
        break;
      case "EndWalk":
        if (keys.justJump) { this.enter("JumpIdle"); break; }
        if (keys.anyDirection) { if (keys.run) this.enter("Sprint"); else if (w.speed > 0.5) this.enter("Walk"); else this.startWalk(); break; }
        if (this.ended(step)) this.enter("Idle");
        break;
      case "JumpIdle":
        if (this.jumped) { this.steers = true; this.velocityTarget = keys.anyDirection ? 0.8 : 0; }
        if (this.timer > 0.2 && !this.jumped) { w.jump(-1); this.jumped = true; this.velocity.mass = 100; this.rotation.damping = 0.3; this.airInfluence = 0.3; }
        else if (this.timer > 0.3 && w.grounded) this.drop(keys);
        else if (this.ended(step)) this.enter("Falling");
        return; // in the air the ground rule below does not apply
      case "JumpRunning":
        if (this.jumped) this.velocityTarget = keys.anyDirection ? 0.8 : 0;
        if (this.timer > 0.13 && !this.jumped) { w.jump(4); this.jumped = true; this.rotation.damping = 0.3; this.airInfluence = 0.05; }
        else if (this.timer > 0.24 && w.grounded) this.drop(keys);
        else if (this.ended(step)) this.enter("Falling");
        return;
      case "Falling":
        this.velocityTarget = keys.anyDirection ? 0.8 : 0;
        if (w.grounded) this.drop(keys);
        return;
      case "DropIdle":
        if (keys.justJump) { this.enter("JumpIdle"); break; }
        if (keys.anyDirection) { this.enter("StartWalkForward"); break; }
        if (this.ended(step)) this.enter("Idle");
        break;
      case "DropRunning":
        if (!keys.anyDirection) { this.enter("EndWalk"); break; }
        if (keys.justRun) { this.enter("Sprint"); break; }
        if (keys.justJump) { this.enter("JumpRunning"); break; }
        if (this.ended(step)) this.enter("Walk");
        return;
      case "DropRolling":
        if (this.ended(step)) this.enter(keys.anyDirection ? "Walk" : "EndWalk");
        return;

      case "OpenVehicleDoor":
        if (this.timer > 0.3 && !this.opened) { this.opened = true; w.vehicle?.open(); }
        if (this.ended(step)) { if (keys.anyDirection) { w.cancelEntry(); w.released("Idle"); } else this.enter("EnteringVehicle"); }
        else this.progress = Math.min(1, this.approach.step());
        return;
      case "EnteringVehicle": {
        if (this.ended(step)) { if (w.vehicle && !w.vehicle.driverSeat) this.enter("Sitting"); else { w.seated(); this.enter("Driving"); } return; }
        this.approach.step();
        this.progress = ease(Math.min(1, Math.max(0, this.timer / (this.length - (w.vehicle?.airplane ? 0.3 : 0)))));
        return;
      }
      case "Sitting": // a passenger's seat: close the door if it stands open; whoever got in to drive (F) slides over to the wheel; X slides over by choice
        if (w.vehicle?.hasDoor && w.vehicle.doorOpen && w.vehicle.noDirection) this.enter("CloseVehicleDoorInside");
        else if (w.vehicle?.wantsToDrive) { w.beginShift(true); this.enter("SwitchingSeats"); }
        else if (keys.justSwitch && w.vehicle?.canSwitch) { w.beginShift(false); this.enter("SwitchingSeats"); }
        else if (keys.justEnter && this.canLeaveVehicles) this.enter(w.vehicle?.airplane ? "ExitingAirplane" : "ExitingVehicle");
        return;
      case "SwitchingSeats":
        if (this.ended(step)) { w.shifted(); if (w.vehicle?.driverSeat) { w.seated(); this.enter("Driving"); } else this.enter("Sitting"); }
        else this.progress = ease(this.timer / this.length);
        return;
      case "Driving":
        if (keys.justEnter && this.canLeaveVehicles) { this.enter(w.vehicle?.airplane ? "ExitingAirplane" : "ExitingVehicle"); return; }
        if (keys.justSwitch && w.vehicle?.canSwitch) { w.unseated(); w.beginShift(false); this.enter("SwitchingSeats"); return; }
        if (w.vehicle?.hasDoor && w.vehicle.doorOpen && w.vehicle.noDirection) this.enter("CloseVehicleDoorInside");
        return;
      case "CloseVehicleDoorInside":
        if (this.timer > 0.4 && !this.closed) { this.closed = true; w.vehicle?.close(); }
        if (this.ended(step)) this.enter(w.vehicle && !w.vehicle.driverSeat ? "Sitting" : "Driving");
        return;
      case "ExitingVehicle":
        if (this.ended(step)) {
          const v = w.vehicle; // (the world makes it Falling instead if there is no ground under the door)
          w.released(v && v.speed > 1 ? "DropRolling" : keys.anyDirection || !v?.hasDoor ? "Idle" : "CloseVehicleDoorOutside");
        } else this.progress = ease(this.timer / this.length);
        return;
      case "ExitingAirplane":
        if (this.ended(step)) w.released("Falling");
        else { const f = Math.min(1, Math.max(0, (this.timer / this.length - 0.3) / 0.7)); this.progress = 1 - (1 - f) * (1 - f); }
        return;
      case "CloseVehicleDoorOutside":
        if (this.timer > 0.3 && !this.closed) { this.closed = true; w.vehicle?.close(); }
        if (this.ended(step)) { w.cancelEntry(); this.enter("Idle"); }
        return;
    }
    // every state on the ground: walk off an edge and it falls
    if (onFoot && !w.grounded && this.state === s) this.enter("Falling");
  }
}
