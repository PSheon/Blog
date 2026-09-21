import { describe, expect, it } from "vitest";
import { Character, Spring, type Keys, type Surroundings } from "../../content/posts/light-playground/components/game/character";

const LENGTH: Record<string, number> = { idle: 0.8, run: 0.6, sprint: 0.4, stop: 0.5, start_forward: 0.5, start_left: 0.5, start_right: 0.5, start_back_left: 0.6, start_back_right: 0.6, rotate_left: 0.65, rotate_right: 0.65, jump_idle: 0.5, jump_running: 0.75, falling: 0.8, drop_idle: 0.5, drop_running: 0.27, drop_running_roll: 0.53, open_door_standing_left: 0.55, open_door_standing_right: 0.55, sit_down_left: 0.55, sit_down_right: 0.55, driving: 0.2, close_door_sitting_left: 0.75, close_door_sitting_right: 0.75, stand_up_left: 0.55, stand_up_right: 0.55, close_door_standing_left: 0.8, close_door_standing_right: 0.8, enter_airplane_left: 1.15, enter_airplane_right: 1.15 };
const none: Keys = { anyDirection: false, justDirection: false, run: false, justRun: false, justJump: false, justEnter: false };

function setup() {
  const log: string[] = [], door = { open: false };
  const w = { grounded: true, speed: 0, impact: 0, turn: 0, vehicle: null as Surroundings["vehicle"], clipLength: (c: string) => LENGTH[c] ?? 0.5, jump: (s: number) => { log.push(`jump ${s}`); w.grounded = false; }, seated: () => log.push("seated"), unseated: () => log.push("unseated"), beginShift: (toDriver: boolean) => log.push(`shift ${toDriver ? "to the wheel" : "to the next seat"}`), shifted: () => log.push("shifted"), released: (to: string) => log.push(`released ${to}`), cancelEntry: () => log.push("cancel") };
  const c = new Character(w as Surroundings), run = (seconds: number, keys: Partial<Keys> = {}) => { const seen = new Set<string>(); for (let i = 0; i < Math.round(seconds * 60); i++) { c.update(1 / 60, { ...none, ...keys }); seen.add(c.state); } return [...seen]; };
  const vehicle = (airplane = false, driverSeat = true, wantsToDrive = true): NonNullable<Surroundings["vehicle"]> => ({ driverSeat, wantsToDrive, canSwitch: !airplane, shiftSide: "left", airplane, hasDoor: !airplane, get doorOpen() { return door.open; }, side: "right", exitSide: "left", doorSide: "left", speed: 0, open: () => { door.open = true; log.push("door open"); }, close: () => { door.open = false; log.push("door close"); }, noDirection: true });
  return { c, w, run, log, vehicle };
}

describe("the character's states, as Sketchbook has them", () => {
  it("starts to walk with the clip for the way it has to turn, then walks; stops with the stop clip", () => {
    for (const [turn, state, clip] of [[0, "StartWalkForward", "start_forward"], [1.2, "StartWalkLeft", "start_left"], [-1.2, "StartWalkRight", "start_right"], [2.9, "StartWalkBackLeft", "start_back_left"], [-2.9, "StartWalkBackRight", "start_back_right"]] as const) {
      const { c, w, run } = setup(); w.turn = turn;
      run(1 / 60, { anyDirection: true, justDirection: true });
      expect([c.state, c.clip]).toEqual([state, clip]);
      expect(c.velocityTarget).toBe(0.8);
      run(1, { anyDirection: true }); expect([c.state, c.clip]).toEqual(["Walk", "run"]);
      w.speed = 3; run(1 / 60); expect([c.state, c.clip]).toEqual(["EndWalk", "stop"]);
      run(1); expect(c.state).toBe("Idle");
    }
  });

  it("turns on the spot when the stick was only flicked sideways", () => {
    const { c, w, run } = setup(); w.turn = 2;
    run(1 / 60, { anyDirection: true, justDirection: true }); run(1 / 60);
    expect([c.state, c.clip]).toEqual(["IdleRotateLeft", "rotate_left"]);
    run(1); expect(c.state).toBe("Idle");
  });

  it("sprints while run is held, with its own springs", () => {
    const { c, run } = setup();
    run(0.2, { anyDirection: true, run: true, justRun: true });
    expect([c.state, c.clip, c.velocityTarget, c.rotation.mass]).toEqual(["Sprint", "sprint", 1.4, 50]);
    run(1 / 60, { anyDirection: true }); expect(c.state).toBe("Walk");
  });

  it("jumps 0.2 s into the jump clip when standing, 0.13 s when running, and lands by how hard it hit", () => {
    const a = setup();
    a.run(1 / 60, { justJump: true }); expect(a.c.state).toBe("JumpIdle");
    a.run(0.19); expect(a.log).toEqual([]);
    a.run(0.05); expect(a.log).toEqual(["jump -1"]);
    a.run(1.2); expect(a.c.state).toBe("Falling");
    a.w.grounded = true; a.w.impact = -3; a.run(1 / 60); expect([a.c.state, a.c.clip]).toEqual(["DropIdle", "drop_idle"]);

    const b = setup();
    b.run(1, { anyDirection: true }); b.run(1 / 60, { anyDirection: true, justJump: true }); expect(b.c.state).toBe("JumpRunning");
    b.run(0.15, { anyDirection: true }); expect(b.log).toEqual(["jump 4"]);
    b.run(1, { anyDirection: true }); b.w.grounded = true; b.w.impact = -3; b.run(1 / 60, { anyDirection: true }); expect(b.c.state).toBe("DropRunning");

    const r = setup();
    r.w.grounded = false; r.run(1 / 60); expect(r.c.state).toBe("Falling");
    r.w.grounded = true; r.w.impact = -9; r.run(1 / 60); expect([r.c.state, r.c.clip]).toEqual(["DropRolling", "drop_running_roll"]);
    r.run(1); expect(r.c.state).toBe("EndWalk");
  });

  it("gets into a car: opens the door at 0.3 s, sits down, takes the wheel, closes the door from inside; and out again", () => {
    const { c, w, run, log, vehicle } = setup();
    w.vehicle = vehicle();
    c.enter("OpenVehicleDoor"); expect(c.clip).toBe("open_door_standing_right");
    run(0.25); expect(log).toEqual([]); run(0.1); expect(log).toEqual(["door open"]);
    expect(c.progress).toBeGreaterThan(0.5);
    run(0.4); expect([c.state, c.clip]).toEqual(["EnteringVehicle", "sit_down_right"]);
    run(0.3); expect(c.progress).toBeGreaterThan(0.3); expect(c.progress).toBeLessThan(1);
    run(0.4); expect(log).toContain("seated");
    expect(c.state).toBe("CloseVehicleDoorInside"); expect(c.clip).toBe("close_door_sitting_left"); // the door is open and nothing is pressed
    run(0.5); expect(log.at(-1)).toBe("door close");
    run(0.5); expect([c.state, c.clip]).toEqual(["Driving", "driving"]);
    run(1 / 60, { justEnter: true }); expect([c.state, c.clip]).toEqual(["ExitingVehicle", "stand_up_left"]);
    expect(log.at(-1)).toBe("door open");
    run(0.7); expect(log.at(-1)).toBe("released CloseVehicleDoorOutside");
  });

  it("from the passenger's side: sits down there, closes that door, slides over to the wheel, and only then drives", () => {
    const { c, w, run, log, vehicle } = setup();
    const seat = vehicle(false, false); w.vehicle = seat;
    c.enter("OpenVehicleDoor"); run(0.6); expect(c.state).toBe("EnteringVehicle");
    run(0.6); expect(log).not.toContain("seated"); // in a seat, but not at the wheel
    expect(c.state).toBe("CloseVehicleDoorInside");
    run(0.8); expect(log.slice(-2)).toEqual(["door close", "shift to the wheel"]); // it got in to drive (F), so it goes on by itself
    expect([c.state, c.clip]).toEqual(["SwitchingSeats", "sitting_shift_left"]);
    run(0.3); expect(c.progress).toBeGreaterThan(0); expect(c.progress).toBeLessThan(1);
    (seat as { driverSeat: boolean }).driverSeat = true; // what `shifted` does in the world
    run(0.4); expect(log.slice(-2)).toEqual(["shifted", "seated"]);
    expect([c.state, c.clip]).toEqual(["Driving", "driving"]);
  });

  it("as a passenger (G): stays in that seat; X slides over to the wheel and back; F gets out from where it sits", () => {
    const { c, w, run, log, vehicle } = setup();
    const seat = vehicle(false, false, false); w.vehicle = seat;
    c.enter("EnteringVehicle"); run(2);
    expect([c.state, c.clip]).toEqual(["Sitting", "sitting"]); expect(log).not.toContain("seated");
    run(3); expect(c.state).toBe("Sitting"); // nobody told it to drive
    run(1 / 60, { justSwitch: true }); expect(c.state).toBe("SwitchingSeats"); expect(log.at(-1)).toBe("shift to the next seat");
    (seat as { driverSeat: boolean }).driverSeat = true;
    run(1); expect(c.state).toBe("Driving"); expect(log.slice(-2)).toEqual(["shifted", "seated"]);
    run(1 / 60, { justSwitch: true }); expect(log.slice(-2)).toEqual(["unseated", "shift to the next seat"]); // the driver lets go of the wheel first
    (seat as { driverSeat: boolean }).driverSeat = false;
    run(1); expect(c.state).toBe("Sitting");
    run(1 / 60, { justEnter: true }); expect(c.state).toBe("ExitingVehicle");
  });

  it("climbs into the aeroplane with its own clip, and leaves it with a jump", () => {
    const { c, w, run, log, vehicle } = setup();
    w.vehicle = vehicle(true);
    c.enter("EnteringVehicle"); expect(c.clip).toBe("enter_airplane_right");
    run(1.3); expect(c.state).toBe("Driving");
    run(1 / 60, { justEnter: true }); expect([c.state, c.clip]).toEqual(["ExitingAirplane", "jump_idle"]);
    run(0.6); expect(log.at(-1)).toBe("released Falling");
  });

  it("has Sketchbook's spring", () => {
    const s = new Spring(10, 0.5); s.target = 1;
    const first = s.step(); expect(first).toBeCloseTo(0.05, 6); // (1 − 0) / 10, halved
    for (let i = 0; i < 200; i++) s.step();
    expect(s.position).toBeCloseTo(1, 4);
  });
});
