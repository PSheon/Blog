/// <reference lib="webworker" />
import { DIMS, PointDiffusion, gaussian, schedule } from "./diffusion";
import { LIVE, type Reply, type Request } from "./protocol";
import { SHAPES, type ShapeName } from "./shapes";

/**
 * The model lives here, off the main thread: training, the first instrument's endless sampling and every one-off
 * request. On the main thread the same work cost 55 ms frames while training and a 2 s freeze per sampling run.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (reply: Reply, transfer: Transferable[] = []) => scope.postMessage(reply, transfer);

let pair: [ShapeName, ShapeName] = ["apple", "banana"];
let model = new PointDiffusion(2);
let generation = 0, running = false, trainMs = 0, lastStats = 0;
const live = { on: false, loop: true, blend: 0.5, again: false, cloud: new Float64Array(LIVE.perCloud * LIVE.clouds * DIMS), levels: schedule(LIVE.steps), at: LIVE.steps + 1, doneAt: 0, lastFrame: 0, generation: -1 };
let ticking = false;
/** Training runs in slices this long, so that messages and the live clouds get a turn in between. */
const TRAIN_SLICE_MS = 24;
// setTimeout(0) is clamped to 4 ms once nested; a message to ourselves is not.
const yielder = new MessageChannel();
yielder.port1.onmessage = () => tick();

function stats() {
  post({ type: "stats", steps: model.steps, loss: model.loss, perSec: trainMs ? (model.steps / trainMs) * 1000 : 0, generation });
}

function fresh() {
  model = new PointDiffusion(2);
  generation++;
  trainMs = 0;
  running = false;
  stats();
}

/** One slice of work, then yield so that messages from the page get a turn. */
function tick() {
  const now = performance.now();
  if (running) {
    const shapes = pair.map((name) => SHAPES[name]);
    do model.train(shapes, 256, model.steps < 4000 ? 2e-3 : 5e-4);
    while (performance.now() - now < TRAIN_SLICE_MS);
    trainMs += performance.now() - now;
    if (now - lastStats > 200) { lastStats = now; stats(); }
  }
  if (live.on && now - live.lastFrame >= LIVE.frameMs) {
    const finished = live.at > LIVE.steps;
    if (finished && (live.again || live.generation !== generation || (live.loop && now - live.doneAt > LIVE.holdMs))) {
      for (let i = 0; i < live.cloud.length; i++) live.cloud[i] = gaussian(Math.random);
      live.at = 0;
      live.again = false;
      live.generation = generation;
    }
    if (live.at <= LIVE.steps) {
      if (live.at < LIVE.steps) {
        // Left cloud wants the first fruit, right cloud the second, the other one a mix of the two.
        const wanted = [[1, 0], [1 - live.blend, live.blend], [0, 1]];
        model.denoise(live.cloud, live.levels[live.at], live.levels[live.at + 1], (i) => wanted[Math.floor(i / LIVE.perCloud)]);
      }
      if (++live.at > LIVE.steps) live.doneAt = now;
      const cloud = Float32Array.from(live.cloud);
      post({ type: "frame", cloud, generation }, [cloud.buffer]);
      live.lastFrame = now;
    }
  }
  if (running) yielder.port2.postMessage(0);
  else if (live.on) setTimeout(tick, 8);
  else ticking = false;
}

function wake() {
  if (ticking) return;
  ticking = true;
  setTimeout(tick, 0);
}

const TWO = [[1, 0], [0, 1]];

scope.onmessage = ({ data }: MessageEvent<Request>) => {
  switch (data.type) {
    case "pair":
      if (data.pair[0] !== pair[0] || data.pair[1] !== pair[1]) { pair = data.pair; fresh(); }
      break;
    case "reset":
      fresh();
      break;
    case "run":
      running = data.running;
      stats();
      break;
    case "live":
      live.on = data.on;
      live.loop = data.loop;
      break;
    case "blend":
      live.blend = data.blend;
      break;
    case "again":
      live.again = true;
      break;
    case "trajectory": {
      const n = data.perCloud * 2 * DIMS, levels = schedule(data.steps), cloud = Float64Array.from({ length: n }, () => gaussian(Math.random));
      const wanted = (i: number) => TWO[Math.floor(i / data.perCloud)];
      const points = new Float32Array(n * (data.steps + 1)), guesses = new Float32Array(n * (data.steps + 1));
      for (let k = 0; k <= data.steps; k++) {
        points.set(cloud, k * n);
        // At level 0 there is no noise left to remove: the guess is the cloud itself.
        guesses.set(levels[k] > 0 ? model.guess(cloud, levels[k], wanted) : cloud, k * n);
        if (k < data.steps) model.denoise(cloud, levels[k], levels[k + 1], wanted);
      }
      post({ type: "trajectory", id: data.id, levels, points, guesses, trainedFor: model.steps }, [points.buffer, guesses.buffer]);
      break;
    }
    case "guided": {
      const levels = schedule(data.steps), x = Float64Array.from(data.start);
      for (let k = 0; k < data.steps; k++) model.denoise(x, levels[k], levels[k + 1], (i) => TWO[Math.floor(i / data.perCloud)], data.guidance);
      const cloud = Float32Array.from(x);
      post({ type: "guided", id: data.id, cloud, trainedFor: model.steps }, [cloud.buffer]);
      break;
    }
    case "field": {
      const noise = Float32Array.from(model.noiseIn(data.points, data.level, () => TWO[0]));
      post({ type: "field", id: data.id, noise, trainedFor: model.steps }, [noise.buffer]);
      break;
    }
  }
  wake();
};
