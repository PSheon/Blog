/// <reference lib="webworker" />
import { BIG, type Reply, type Request } from "./protocol";
import { type Action, type CameraShift, encode, expert, IDLE_TOKENS, type Manifest, NO_SHIFT, PARAMS, PolicyNet, proprioOf, render, World, type WorldEvent } from "./sim";

/*
 * The bench off the main thread: the world, both pictures and (when the model drives) the CPU forward pass, which is
 * tens of milliseconds a step. The page only ever receives finished frames.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope, post = (reply: Reply, transfer: Transferable[] = []) => scope.postMessage(reply, transfer);
const STEP_MS = 140, TILT: CameraShift = { ...NO_SHIFT, yaw: (5 * Math.PI) / 180 }, nets = new Map<string, PolicyNet>();

let world = new World(1), seed = 2, running = false, slip: number = PARAMS.slip, tilted = false, driver: "expert" | "model" = "expert", checkpoint = "";
let last: WorldEvent | null = null, holdUntil = 0, inferenceMs = 0, window: Uint8Array[] = [], history: number[][] = [IDLE_TOKENS, IDLE_TOKENS, IDLE_TOKENS];

const fresh = () => { world = new World(seed++); world.slipRate = slip; last = null; window = []; history = [IDLE_TOKENS, IDLE_TOKENS, IDLE_TOKENS]; };
const draw = () => {
  const shift = tilted ? TILT : NO_SHIFT, big = render(world, shift, BIG, 1), eye = render(world, shift);
  post({ type: "frame", big, eye, words: encode(world.task), expertState: expert(world).state, step: world.t, outcome: world.success ? "success" : world.failed ? "failed" : "running", event: last, driver, inferenceMs }, [big.buffer, eye.buffer]);
};

async function load(name: string): Promise<PolicyNet> {
  const have = nets.get(name);
  if (have) return have;
  post({ type: "loading", checkpoint: name });
  const [manifest, weights] = await Promise.all([fetch(`/vla/${name}.json`).then((r) => r.json() as Promise<Manifest>), fetch(`/vla/${name}.bin`).then((r) => r.arrayBuffer())]);
  const net = new PolicyNet(manifest, weights);
  nets.set(name, net);
  return net;
}

function decide(): Action {
  const net = driver === "model" ? nets.get(checkpoint) : undefined;
  if (!net) return expert(world).action;
  // The model gets what it was trained on: the last k pictures, the words, its own joints, its last three steps.
  window.push(render(world, tilted ? TILT : NO_SHIFT)); if (window.length > net.frames) window.shift();
  const frames = Array.from({ length: net.frames }, (_, i) => window[Math.max(0, window.length - net.frames + i)]), started = performance.now();
  const { tokens } = net.act(frames, encode(world.task), proprioOf(world), history.slice(-3));
  inferenceMs = performance.now() - started;
  history.push(tokens);
  return [tokens[0], tokens[1], tokens[2], tokens[3], tokens[4] - PARAMS.bins];
}

function tick() {
  setTimeout(tick, STEP_MS);
  if (!running || performance.now() < holdUntil) return;
  if (world.success || world.failed) { fresh(); holdUntil = performance.now() + 600; draw(); return; }
  world.slipRate = slip;
  world.step(decide());
  if (world.events.length) last = world.events[world.events.length - 1];
  if (world.success || world.failed) holdUntil = performance.now() + 1200; // let the result be seen
  draw();
}

scope.onmessage = ({ data }: MessageEvent<Request>) => {
  if (data.type === "run") running = data.on;
  else if (data.type === "next") fresh();
  else if (data.type === "slip") slip = data.slip;
  else if (data.type === "tilt") tilted = data.on;
  else if (data.type === "disturb") { if (data.what === "shove") world.shoveArm(); else if (data.what === "nudge") world.nudgeBoard(world.task.nest); else world.turnBoard(world.task.nest); }
  else if (data.type === "driver") {
    driver = data.driver; checkpoint = data.checkpoint;
    if (driver === "model") { void load(checkpoint).then(() => { fresh(); draw(); }, (e: unknown) => post({ type: "error", message: String(e) })); return; }
    fresh();
  }
  draw();
};
fresh(); draw(); tick();
