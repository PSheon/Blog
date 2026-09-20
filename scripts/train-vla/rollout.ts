/**
 * Node only. Runs many worlds in step against a PyTorch checkpoint served over a pipe (serve.py), for evaluation and
 * for DAgger. Everything the model is judged on — rules, pixels, the expert's labels — is the TypeScript the page runs.
 */
import { type ChildProcessByStdio, spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, writeFileSync, writeSync } from "node:fs";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { mulberry32 } from "@/lib/ml";
import { type Action, type CameraShift, encode, expert, NO_SHIFT, PARAMS, proprioOf, render, STILL, World } from "@/content/posts/pcb-flip-vla/components/sim";

const BINS = PARAMS.bins, IDLE = [STILL, STILL, STILL, STILL, BINS];
export const toTokens = (a: Action): number[] => [a[0], a[1], a[2], a[3], BINS + a[4]];
export const toAction = (t: number[]): Action => [t[0], t[1], t[2], t[3], t[4] - BINS];

type Child = ChildProcessByStdio<Writable, Readable, null>;

export class Policy {
  private readonly child: Child;
  private readonly waiting: ((line: string) => void)[] = [];
  private constructor(child: Child) { this.child = child; createInterface({ input: child.stdout }).on("line", (l) => this.waiting.shift()?.(l)); }
  private next(): Promise<string> { return new Promise((resolve) => this.waiting.push(resolve)); }

  static async load(model: string): Promise<Policy> {
    const child = spawn("uv", ["run", "--with", "torch", "--with", "numpy", "python", "serve.py", model], { cwd: "scripts/train-vla", stdio: ["pipe", "pipe", "inherit"] });
    const policy = new Policy(child);
    await policy.next(); // "ready"
    return policy;
  }

  async act(batch: { frames: Uint8Array[]; words: number[]; history: number[][]; proprio: number[] }[]): Promise<number[][]> {
    this.child.stdin.write(`${JSON.stringify({ frames: Buffer.concat(batch.flatMap((b) => b.frames)).toString("base64"), words: batch.map((b) => b.words), history: batch.map((b) => b.history), proprio: batch.map((b) => b.proprio) })}\n`);
    return JSON.parse(await this.next()) as number[][];
  }

  close(): void { this.child.stdin.end(); }
}

/** What is done to an episode while it runs. `step` counts from 0; return nothing. */
export type Disturb = (world: World, step: number, rng: () => number) => void;
export type Episode = { seed: number; success: boolean; steps: number; lost: boolean; noop: boolean; instruction: number[]; frames: Uint8Array[]; proprio: number[][]; labels: Action[]; taken: Action[] };
export type RolloutOptions = {
  frames: number; slip?: number; camera?: (seed: number) => CameraShift; disturb?: Disturb;
  /** Chance per step that the expert's action is executed instead of the model's (DAgger's β). The label is always the expert's. */
  beta?: number;
  /** Keep frames and labels (DAgger) or only the outcome (evaluation). */
  record?: boolean;
  /** Called once, the first time the job is done: whatever it undoes has to be done again for the episode to count. */
  afterSuccess?: (world: World) => void;
  batch?: number;
};

export async function rollout(policy: Policy, seeds: number[], o: RolloutOptions): Promise<Episode[]> {
  const done: Episode[] = [], queue = [...seeds], size = o.batch ?? 64;
  type Live = { world: World; rng: () => number; shift: CameraShift; window: Uint8Array[]; history: number[][]; ep: Episode; extra: boolean };
  const start = (seed: number): Live => {
    const world = new World(seed); world.slipRate = o.slip ?? PARAMS.slip;
    return { world, rng: mulberry32(seed ^ 0x2545f491), shift: o.camera?.(seed) ?? NO_SHIFT, window: [], history: [IDLE, IDLE, IDLE], extra: false,
      ep: { seed, success: false, steps: 0, lost: false, noop: world.boards[world.task.nest].up === world.wanted, instruction: encode(world.task), frames: [], proprio: [], labels: [], taken: [] } };
  };
  let live: Live[] = [];
  while (queue.length || live.length) {
    while (live.length < size && queue.length) live.push(start(queue.shift() as number));
    const requests = live.map((l) => {
      o.disturb?.(l.world, l.world.t, l.rng);
      const frame = render(l.world, l.shift); l.window.push(frame); if (l.window.length > o.frames) l.window.shift();
      const frames = Array.from({ length: o.frames }, (_, i) => l.window[Math.max(0, l.window.length - o.frames + i)]), proprio = proprioOf(l.world);
      if (o.record) { l.ep.frames.push(frame); l.ep.proprio.push(proprio); }
      return { frames, words: l.ep.instruction, history: l.history.slice(-3), proprio };
    });
    const answers = await policy.act(requests);
    live = live.filter((l, i) => {
      const label = expert(l.world).action, mine = toAction(answers[i]), act = o.beta && l.rng() < o.beta ? label : mine;
      if (o.record) { l.ep.labels.push(label); l.ep.taken.push(act); }
      l.world.step(act); l.history.push(toTokens(act));
      // "Turn the board back once it is right": the first success is undone, and only the second one counts.
      if (l.world.success && o.afterSuccess && !l.extra && !l.ep.noop) { o.afterSuccess(l.world); l.extra = true; return true; }
      if (!l.world.failed && !l.world.success) return true;
      l.ep.success = l.world.success; l.ep.steps = l.world.t; l.ep.lost = l.world.boards[l.world.task.nest].lost;
      done.push(l.ep);
      return false;
    });
  }
  return done.sort((a, b) => a.seed - b.seed);
}

/** The same files export-bc writes, so train.py reads expert data and DAgger data alike. */
export function writeDataset(dir: string, episodes: Episode[]): number {
  mkdirSync(dir, { recursive: true });
  const fd = openSync(`${dir}/frames.u8`, "w"), meta = []; let start = 0;
  for (const e of episodes) {
    for (const f of e.frames) writeSync(fd, f);
    meta.push({ seed: e.seed, start, length: e.frames.length, instruction: e.instruction, proprio: e.proprio, labels: e.labels, taken: e.taken, success: e.success }); start += e.frames.length;
  }
  closeSync(fd); writeFileSync(`${dir}/meta.json`, JSON.stringify(meta));
  return start;
}

/** The six conditions of the main table. */
export const LEVELS: { name: string; options: Partial<RolloutOptions> }[] = [
  { name: "nothing", options: { slip: 0 } },
  { name: "slip 1 %", options: {} },
  { name: "one shove", options: { slip: 0, disturb: (w, step) => { if (step === 10) w.shoveArm(); } } },
  { name: "shove + slip 5 %", options: { slip: 0.05, disturb: (w, step) => { if (step === 10) w.shoveArm(); } } },
  { name: "board turned back", options: { slip: 0, afterSuccess: (w) => w.turnBoard(w.task.nest) } },
  { name: "camera 5° off", options: { slip: 0, camera: () => ({ ...NO_SHIFT, yaw: (5 * Math.PI) / 180 }) } },
];
