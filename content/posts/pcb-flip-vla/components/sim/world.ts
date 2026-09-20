import { mulberry32, type Rng } from "@/lib/ml";
import { clampJoints, type Joints, tipOf, type Vec3 } from "./arm";
import type { Task } from "./language";
import { PARAMS } from "./params";
import { type Action, deltaOf } from "./tokens";

/** A board in its tray: how far it sits from the tray's centre (radially, tangentially), how far off square, which side is up. */
export type Board = { dr: number; dt: number; yaw: number; up: boolean; lost: boolean };
/** What the gripper remembers about the board it holds: the wrist roll at the grasp, how deep the bite, how far off the mid-line. */
export type Hold = { board: 0 | 1; roll: number; bite: number; off: number };
export type WorldEvent = "grasped" | "missed" | "placed" | "dropped" | "lost" | "slipped" | "jammed";

const { nestAngle, nestRadius, railZ, board: BOARD } = PARAMS;

/** Centre of tray `nest` on the bench. */
export const nestCentre = (nest: number): Vec3 => [nestRadius * Math.cos(nestAngle[nest]), nestRadius * Math.sin(nestAngle[nest]), railZ];

/**
 * The bench, two boards and the arm. Kinematic: a held board goes where the gripper goes, and a handful of rules
 * (params.ts) decide when a grasp holds, when a board slips, where it lands and which side is up when it does.
 * Seeded: the same seed and the same actions give the same episode.
 */
export class World {
  q: Joints;
  closed = false;
  boards: [Board, Board];
  hold: Hold | null = null;
  t = 0;
  task: Task;
  /** Chance per step that a held board slips (before the roll-speed factor). */
  slipRate: number = PARAMS.slip;
  readonly events: WorldEvent[] = [];
  private readonly rng: Rng;

  constructor(seed: number) {
    const rng = (this.rng = mulberry32(seed)), spread = (by: number) => (rng() * 2 - 1) * by;
    const board = (): Board => ({ dr: spread(PARAMS.funnel.offset), dt: spread(PARAMS.funnel.offset), yaw: spread(PARAMS.funnel.yaw), up: rng() < 0.5, lost: false });
    this.boards = [board(), board()];
    const nest = rng() < 0.5 ? 0 : 1, already = rng() < PARAMS.noopShare, named = already || rng() < 0.5;
    this.task = { nest, side: named ? (already ? this.boards[nest].up : !this.boards[nest].up) : null };
    this.wanted = named ? (this.task.side as boolean) : !this.boards[nest].up;
    // The wrist starts level either way up. After a flip it rests half a turn round, and the next job begins from there:
    // a model that had only ever started at 0 froze when a finished board was turned back (RESULTS.md, stage 1).
    const roll = [0, Math.PI, -Math.PI][Math.floor(rng() * 3)];
    this.q = clampJoints([PARAMS.home[0] + spread(0.15), PARAMS.home[1] + spread(0.1), PARAMS.home[2] + spread(0.1), roll]);
  }

  /** The side the target board has to end with up ("turn it over" is fixed at the start). */
  readonly wanted: boolean;

  /** Where a board is and how it is turned: centre, heading of its radial axis, and roll about that axis (0 = as it lies). */
  pose(index: 0 | 1): { centre: Vec3; heading: number; roll: number } {
    const b = this.boards[index];
    if (this.hold?.board === index) {
      const tip = tipOf(this.q), c = Math.cos(this.q[0]), s = Math.sin(this.q[0]), out = BOARD.depth / 2 - this.hold.bite;
      return { centre: [tip[0] + c * out + s * this.hold.off, tip[1] + s * out - c * this.hold.off, tip[2]], heading: this.q[0] + b.yaw, roll: this.q[3] - this.hold.roll };
    }
    const angle = nestAngle[index], r = nestRadius + b.dr, a = angle + b.dt / nestRadius;
    return { centre: [r * Math.cos(a), r * Math.sin(a), railZ + BOARD.thickness / 2], heading: a + b.yaw, roll: 0 };
  }

  /** Which side would be up if the held board were let go now: past a quarter turn it lands turned. */
  sideIfReleased(): boolean | null {
    if (!this.hold) return null;
    return this.boards[this.hold.board].up !== Math.cos(this.q[3] - this.hold.roll) < 0;
  }

  get success(): boolean {
    const b = this.boards[this.task.nest];
    return this.t >= 3 && !b.lost && this.hold === null && !this.closed && b.up === this.wanted && tipOf(this.q)[2] >= 0.08;
  }

  get failed(): boolean { return this.boards[this.task.nest].lost || this.t >= PARAMS.maxSteps; }

  step(action: Action): void {
    this.events.length = 0;
    this.move(action);
    const close = action[4] === 1;
    if (close && !this.closed) this.tryGrasp(); else if (!close && this.closed && this.hold) this.release(false);
    this.closed = close;
    if (this.hold && this.rng() < this.slipRate * (1 + PARAMS.rollSlip * Math.abs(deltaOf(3, action[3])) / PARAMS.maxDelta[3])) { this.events.push("slipped"); this.release(true); this.closed = true; }
    this.t++;
  }

  /** Joints move by what the bins say, unless that would push the board or the gripper through the rails or the bench. */
  private move(action: Action): void {
    const wanted = clampJoints(this.q.map((v, j) => v + deltaOf(j, action[j])) as Joints);
    const tries: Joints[] = [wanted, [wanted[0], wanted[1], wanted[2], this.q[3]], [wanted[0], this.q[1], this.q[2], wanted[3]], [wanted[0], this.q[1], this.q[2], this.q[3]]];
    const allowed = tries.find((q) => this.clear(q)) ?? this.q;
    if (allowed !== wanted) this.events.push("jammed");
    this.q = allowed;
  }

  /** The lowest point of whatever the gripper carries stays above the rails (over a tray) or the bench. */
  private clear(q: Joints): boolean {
    const tip = tipOf(q), overTray = [0, 1].some((n) => Math.hypot(tip[0] - nestCentre(n)[0], tip[1] - nestCentre(n)[1]) < 0.12);
    const half = this.hold ? (BOARD.length / 2) * Math.abs(Math.sin(q[3] - this.hold.roll)) : 0;
    return tip[2] - half >= (overTray ? railZ : 0.01) - 1e-9;
  }

  private tryGrasp(): void {
    const tip = tipOf(this.q), g = PARAMS.grasp;
    for (const index of [0, 1] as const) {
      const b = this.boards[index];
      if (b.lost) continue;
      const { centre, heading } = this.pose(index), c = Math.cos(heading), s = Math.sin(heading);
      // The tip in the board's frame: `along` its radial axis from the near edge inwards, `off` the mid-line.
      const dx = tip[0] - centre[0], dy = tip[1] - centre[1], along = dx * c + dy * s + BOARD.depth / 2, off = -dx * s + dy * c;
      if (Math.abs(off) > BOARD.length / 2 + 0.02 || along < -0.03 || along > BOARD.depth || Math.abs(tip[2] - centre[2]) > 0.04) continue;
      const square = Math.abs(Math.atan2(Math.sin(heading - this.q[0]), Math.cos(heading - this.q[0])));
      const holds = Math.abs(off) <= g.tangential && along >= g.biteMin && along <= g.biteMax && Math.abs(tip[2] - centre[2]) <= g.height && square <= g.yaw && Math.abs(Math.sin(this.q[3])) <= g.rollSin;
      if (holds) { this.hold = { board: index, roll: this.q[3], bite: along, off }; b.yaw = heading - this.q[0]; this.events.push("grasped"); }
      else { this.settle(b); this.events.push("missed"); } // a bad pinch shoves the board about in its tray
      return;
    }
  }

  /** Opening the gripper (or a slip). Level, low and over the tray, the board is placed; otherwise it falls. */
  private release(slipped: boolean): void {
    const hold = this.hold as Hold, b = this.boards[hold.board], { centre, roll } = this.pose(hold.board), nest = nestCentre(hold.board);
    const away = Math.hypot(centre[0] - nest[0], centre[1] - nest[1]), turned = Math.cos(roll) < 0, p = PARAMS.place;
    this.hold = null;
    if (away > PARAMS.trayReach) { b.lost = true; this.events.push("lost"); return; }
    if (turned) b.up = !b.up;
    const placed = !slipped && away <= p.offset + PARAMS.funnel.offset && centre[2] - railZ <= p.height && Math.abs(Math.sin(roll)) <= p.rollSin;
    if (placed) {
      // Where it was put, in tray coordinates.
      const a = nestAngle[hold.board], c = Math.cos(a), s = Math.sin(a), dx = centre[0] - nest[0], dy = centre[1] - nest[1];
      b.dr = dx * c + dy * s; b.dt = -dx * s + dy * c; b.yaw = this.q[0] + b.yaw - a;
      this.events.push("placed");
    } else { this.settle(b); this.events.push("dropped"); }
  }

  /** The tray's walls funnel a board that fell or was shoved to somewhere near the middle, nearly square. */
  private settle(b: Board): void {
    const spread = (by: number) => (this.rng() * 2 - 1) * by;
    b.dr = spread(PARAMS.funnel.offset); b.dt = spread(PARAMS.funnel.offset); b.yaw = spread(PARAMS.funnel.yaw);
  }

  // ── what the reader can do to it ──────────────────────────────────────────

  /** A shove: the arm jumps (about 80 mm at the tip) and drops whatever it held. */
  shoveArm(): void {
    if (this.hold) this.release(true);
    const sign = () => (this.rng() < 0.5 ? -1 : 1);
    this.q = clampJoints([this.q[0] + sign() * 0.2, this.q[1] + sign() * 0.15, this.q[2], this.q[3]]);
    if (!this.clear(this.q)) this.q = clampJoints([this.q[0], this.q[1] + 0.3, this.q[2], this.q[3]]);
  }

  nudgeBoard(index: 0 | 1): void { if (this.hold?.board !== index && !this.boards[index].lost) this.settle(this.boards[index]); }

  /** Someone turns the board back over. Nothing about the arm changes; only what the camera sees. */
  turnBoard(index: 0 | 1): void { const b = this.boards[index]; if (this.hold?.board !== index && !b.lost) b.up = !b.up; }
}
