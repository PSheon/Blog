/// <reference lib="webworker" />
import { NO_SHIFT, Policy, Trainer, evaluate, picture, view, type XY } from "./model";
import type { Reply, Request } from "./protocol";

/** Training runs here so the page keeps scrolling: 10 000 steps of 16 pictures, the recipe of docs/research/head-camera run 9. */
const STEPS = 10_000, EVERY = 50, EPISODES = 100;
/** A fixed picture the reader watches while the keypoints find the hand and the block. */
const PROBE = { tip: [0.34, -0.1] as XY, block: [0.44, 0.08] as XY };
let run = 0;

const post = (reply: Reply) => (self as unknown as Worker).postMessage(reply);

self.onmessage = ({ data }: MessageEvent<Request>) => {
  const id = ++run;
  if (data.type === "stop") return;
  const trainer = new Trainer(data.seed, STEPS), t0 = performance.now(), probeBytes = view(PROBE.tip, PROBE.block, NO_SHIFT), probe = picture(probeBytes);
  post({ type: "probe", bytes: probeBytes });
  let losses = 0;
  const chunk = () => {
    if (id !== run) return; // a newer start or a stop
    for (let i = 0; i < EVERY && trainer.step < STEPS; i++) losses += trainer.train();
    const policy = new Policy(trainer.save(data.seed));
    post({ type: "progress", step: trainer.step, steps: STEPS, loss: losses / EVERY, seconds: (performance.now() - t0) / 1000, keypoints: policy.run(probe).keypoints });
    losses = 0;
    if (trainer.step < STEPS) { setTimeout(chunk, 0); return; }
    const seconds = (performance.now() - t0) / 1000;
    post({ type: "testing" });
    const straight = evaluate(policy, NO_SHIFT, EPISODES, 99), pitched = evaluate(policy, { ...NO_SHIFT, pitch: (5 * Math.PI) / 180 }, EPISODES, 99);
    post({ type: "done", saved: trainer.save(data.seed), seconds, straight, pitched, episodes: EPISODES });
  };
  chunk();
};
