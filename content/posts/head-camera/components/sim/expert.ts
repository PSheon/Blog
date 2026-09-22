import { type Joints, solveIK, tipOf, type Vec3 } from "./arm";
import { PARAMS } from "./params";
import { type Action, binOf, STILL } from "./tokens";
import { nestCentre, type World } from "./world";

const { board: BOARD, railZ } = PARAMS;
/** The expert moves the tip at most this far per step, so its path through space is nearly straight. */
const STRIDE = 0.035;

export type ExpertState = "done" | "open" | "rise" | "above" | "level" | "descend" | "grasp" | "lift" | "roll" | "over" | "lower" | "release";

/**
 * A scripted expert with no memory: every step it looks at the true state of the world and decides again what comes
 * next. That is where its recoveries come from — a dropped board simply puts it back at "go above the board".
 * It reads the simulator's state, not pixels; the model will only ever get pixels.
 */
export function expert(world: World): { action: Action; state: ExpertState } {
  const tip = tipOf(world.q), roll = world.q[3], hold = world.hold;
  const towards = (target: Vec3, wantedRoll: number, closed: boolean, state: ExpertState) => ({ action: stepTowards(world.q, target, wantedRoll, closed), state });
  // The nearest roll at which the jaws are level.
  const level = Math.round(roll / Math.PI) * Math.PI;

  if (!hold) {
    const index = world.task.nest, b = world.boards[index];
    if (b.lost || b.up === world.wanted) return { action: jointsTowards(world.q, [...PARAMS.home] as Joints, false), state: "done" };
    if (world.closed) return towards([tip[0], tip[1], Math.max(tip[2], PARAMS.hoverZ)], level, false, "open");
    const { centre, heading } = world.pose(index), back = BOARD.depth / 2 - PARAMS.bite;
    const grip: Vec3 = [centre[0] - Math.cos(heading) * back, centre[1] - Math.sin(heading) * back, centre[2]], off = Math.hypot(tip[0] - grip[0], tip[1] - grip[1]);
    // Above the bite point to within 5 mm; once on the way down a little drift is let pass (the grasp allows 10 mm).
    const descending = tip[2] < PARAMS.hoverZ - 0.01;
    if (off > (descending ? 0.009 : 0.005)) {
      if (descending) return towards([tip[0], tip[1], PARAMS.hoverZ], level, false, "rise");
      return towards([grip[0], grip[1], Math.max(PARAMS.hoverZ, tip[2] - STRIDE)], level, false, "above");
    }
    if (Math.abs(roll - level) > 0.03) return towards([grip[0], grip[1], tip[2]], level, false, "level");
    if (tip[2] > grip[2] + 0.003) return towards(grip, level, false, "descend");
    return { action: [STILL, STILL, STILL, STILL, 1], state: "grasp" };
  }

  // Holding a board. The target board has to end with `wanted` up; any other board goes back the way it was.
  const b = world.boards[hold.board], want = hold.board === world.task.nest ? world.wanted : b.up, nest = nestCentre(hold.board), a = PARAMS.nestAngle[hold.board];
  const back = BOARD.depth / 2 - hold.bite, over: Vec3 = [nest[0] - Math.cos(a) * back, nest[1] - Math.sin(a) * back, PARAMS.liftZ], away = Math.hypot(tip[0] - over[0], tip[1] - over[1]);
  if (world.sideIfReleased() !== want || Math.abs(Math.sin(roll - hold.roll)) > 0.02) {
    if (tip[2] < PARAMS.liftZ - 0.006) return towards([tip[0], tip[1], PARAMS.liftZ], roll, true, "lift");
    if (away > 0.02) return towards(over, roll, true, "over");
    // Half a turn from the grasp, in whichever direction the wrist has room for; or back to level if that is what is wanted.
    const half = hold.roll + Math.PI <= PARAMS.limits.roll[1] ? hold.roll + Math.PI : hold.roll - Math.PI;
    return towards(over, b.up === want ? hold.roll : half, true, "roll");
  }
  const lowering = tip[2] < PARAMS.liftZ - 0.01;
  if (away > (lowering ? 0.012 : 0.005)) return towards(lowering ? [tip[0], tip[1], PARAMS.liftZ] : over, roll, true, "over");
  const rest = railZ + BOARD.thickness / 2;
  if (tip[2] > rest + 0.004) return towards([over[0], over[1], rest], roll, true, "lower");
  return { action: [STILL, STILL, STILL, STILL, 0], state: "release" };
}

/** One step of the tip towards a point in space (at most STRIDE away), and of the wrist towards a roll. */
function stepTowards(q: Joints, target: Vec3, roll: number, closed: boolean): Action {
  const tip = tipOf(q), d = Math.hypot(target[0] - tip[0], target[1] - tip[1], target[2] - tip[2]), f = d > STRIDE ? STRIDE / d : 1;
  const near: Vec3 = [tip[0] + (target[0] - tip[0]) * f, tip[1] + (target[1] - tip[1]) * f, tip[2] + (target[2] - tip[2]) * f];
  return jointsTowards(q, solveIK(near, roll) ?? solveIK(target, roll) ?? ([...PARAMS.home] as Joints), closed, roll);
}

function jointsTowards(q: Joints, goal: Joints, closed: boolean, roll = goal[3]): Action {
  return [binOf(0, goal[0] - q[0]), binOf(1, goal[1] - q[1]), binOf(2, goal[2] - q[2]), binOf(3, roll - q[3]), closed ? 1 : 0];
}
