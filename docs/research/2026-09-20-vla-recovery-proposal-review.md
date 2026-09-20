# № 010 proposal review — "a 3-D VLA that recovers from its own mistakes"

Reviewed 2026-09-20 against the repo as it is (`lib/ml`, DESIGN.md, the eight published articles). Nothing was built.
Machine for the measurements: Apple M4 Pro, node 22.19, vitest; the probe is at the end.

## Verdict

The thesis is good and fits the notebook: *same architecture, the difference is whether the data contains mistakes*. It is
one sentence, it has a payoff the reader can poke, and BC / DART / DAgger / camera randomisation is a clean comparison.

What does not hold is the engineering premise that carries it: **"train a 450 k-parameter VLA in the browser in 4–5
minutes"**. Measured, that is about 28 hours in today's `lib/ml`, and the WebGPU path the proposal leans on does not
exist anywhere in the repo. Three smaller things are also wrong on arithmetic (arm reach, the 8 MB dataset, the expert's
98 %). And as written it is three articles, not one.

## 1. Training cost — measured

`lib/ml` is Float64, CPU, one sequence at a time (a batch is a loop). One forward + backward, same code the Transformer
article uses:

| model | params | tokens | forward | fwd + bwd | 4000 steps × batch 128 | sequences in 3 minutes |
| --- | --- | --- | --- | --- | --- | --- |
| the proposal: 4 layers, d 96, 4 frames × 36 patches + 28 | 487 k | 172 | 66.7 ms | 198 ms | **28.2 h** | 908 |
| 2 frames × 16 patches (12-px patches), 3 layers, d 64 | 170 k | 60 | 8.1 ms | 23.6 ms | 3.4 h | 7 600 |
| true state as tokens (no pixels), 2 layers, d 48 | 70 k | 30 | 1.5 ms | 3.6 ms | 0.5 h | 49 800 |

- The proposal's "CPU: about 40 minutes" is off by roughly 40×. "WebGPU: 4–5 minutes" needs a ~340× speed-up over the
  current path.
- There is no WebGPU code in the repo (searched `lib`, `content`, `components`, `app` for `webgpu`, `navigator.gpu`,
  `wgsl`: nothing). A reverse-mode autodiff on WGSL with gradient checks is its own project — and arguably its own
  article — not "2 days inside stage 3". Even a good hand-written one is unlikely to reach the sustained ~1 TFLOP/s that
  4–5 minutes implies (≈ 2.7 × 10¹⁴ FLOPs for the run).
- "DAgger: five rounds of 40 seconds" is 200 sequences per round at the proposed size. Not a round.
- The ablation list (bins × 3, k × 3, resolution × 3, 2-D vs 3-D, data × 3, 4 modes, 3 seeds) is 40–50 trained models.
  At 28 h each that is not an offline job either.

**What follows.** Checkpoints are not a fallback, they are the only way the pixel model exists. They have to be trained
outside `lib/ml`. The repo already has the pattern: article 001 trains in PyTorch (`scripts/train-mnist`), exports
weights and golden values, and the tests hold the TypeScript inference to them. Do the same: TypeScript owns the
environment, renderer, expert, rollouts and evaluation; PyTorch only trains; a golden test pins `lib/ml`'s forward pass
to PyTorch's.

DAgger needs the current model in the loop. Roll out in node with `lib/ml` inference on each round's exported weights
(2 000 trajectories × 28 steps × 67 ms ≈ 1 h single-threaded, minutes across worker threads), rather than porting the
environment to Python and keeping two copies in step.

**And the "in your browser" promise?** Keep it, on something that fits. The last row of the table trains 50 000
sequences in three minutes. A policy on true-state tokens shows distribution shift, DART and DAgger *live* — the reader
presses train and watches the state cloud thicken — which is sections 4–7 of the proposal. Pixels, camera randomisation
and attention then come from checkpoints, and the text says so. That is also a natural place to cut the article in two
(section 4 below).

## 2. Rendering: do not use three.js for the observation

The proposal renders observations with three.js in a worker (OffscreenCanvas + `readPixels`). Problems:

- It cannot run in node, so neither can data generation, the evaluation scripts or the tests — everything in
  `docs/research/` would need a browser. The proposal itself requires the environment to run in node.
- `readPixels` is a synchronous GPU stall per frame; 3 000 frames/s needs atlas batching, which is more code than the
  alternative below.
- Pixels would differ between GPUs and drivers; "every number reproducible" goes.

A 48 × 48 flat-shaded scene of ≤ 5 cubes, a table and three arm links is a few dozen quads. A z-buffer rasteriser in
TypeScript is ~150 lines, deterministic, identical in node / worker / tests, and at 2 304 pixels a frame it will be
faster than the GPU round trip. It is also in the spirit of the notebook. three.js stays for the scene the reader looks
at, and the "what the model sees" inset shows the rasteriser's actual output.

## 3. Arithmetic that does not work

- **Reach.** Links 0.35 + 0.30 = 0.65 m. On a 1.0 × 0.8 m table with the base at the middle of a long edge, the far
  corners are √(0.5² + 0.8²) = 0.94 m away. "Move it to the back-left corner" cannot be done. Either the table is about
  0.8 × 0.5 m (far corner 0.64 m, still marginal) or the corner targets are inset, or the arm is longer. A test should
  assert every task the grammar can generate is reachable.
- **The 8 MB dataset.** 560 000 frames × 48 × 48 × 3 bytes = 3.9 GB. It does not need to exist: environment, expert and
  rasteriser are deterministic, so a dataset is a list of seeds plus the collection mode. Zero bytes to download.
- **Expert > 98 % at 10 % slip.** Carrying takes about 10 steps; at 10 % per step the block survives a carry 35 % of the
  time. With ~8 steps per retry and a 60-step limit that is five or six attempts: 1 − 0.65⁶ ≈ 92 %, before anything
  else goes wrong. 98 % is plausible at the default 2 %. Measure it; do not write the threshold first.
- **Checkpoints.** 1.8 MB each is right for float32 (450 k × 4). I4 loads four at once: 7.2 MB. int8 with a per-matrix
  scale is 0.45 MB each and worth a golden test.
- **Inference.** 67 ms per forward means I4 (four models in step) runs at 3–4 environment steps a second on this
  machine — acceptable — and about one a second on a phone. The 60-token variant is ~8 ms and would be comfortable.
  Either way the four action tokens need a KV cache, or each step costs four forwards.
- **Mask.** "Images and instruction fully visible, actions causal" is a prefix-LM mask; `lib/ml` only has
  `causalSoftmax`. One new op and its finite-difference test.

## 4. It is three articles

DESIGN.md §6: at most 10 minutes; one idea per section; failure modes as a comparison, not a second playground; "a
field explainer is not an article here". The proposal has 13 sections, six instruments and a dozen experiments.
№ 009 has five figures and came out at 9–10 minutes.

| | article | live in the browser | from checkpoints |
| --- | --- | --- | --- |
| A | **Push it and it climbs back** — BC vs DART vs DAgger on the 3-D arm, policy on state tokens | collect, train, the state-cloud figure (I2), the four-way console (I4) | — |
| B | **What it sees** — the same arm from 48 × 48 pixels: three kinds of token in one decoder, camera randomisation, attention, the god's-eye ablation | inference, I4 with the camera button, I5 | all training |
| C | (already trailed in §12) a diffusion / flow action head | — | — |

A stands alone, keeps the blog's promise and carries the thesis. B inherits A's environment, expert and console and can
say honestly "this one took N hours in PyTorch". Section 12's survey table shrinks to a paragraph in whichever comes last.

## 5. Smaller points

- **Title.** "讓機器人自己站起來" — the arm never falls over, so nothing stands up. Keep the energy, fix the misleading
  half: e.g. 「推它一下，它自己爬回來」, with the honesty ("2.5-D physics, a scripted expert") in the description.
- **Tags.** DESIGN asks to reuse tags; the home rail maps to `computer-vision`, `llm`, `generative`, `ai-agent`.
  `vla`, `imitation-learning`, `three-js` are all new. Suggest `[ai-agent, robotics, from-scratch]` (+ `computer-vision` for B).
- **Camera vs arm.** Put the base at the far edge and the camera at the near one: the arm then reaches towards the
  camera and hides less of the table. Fix this before measuring the BC baseline, not as a later "raise the pitch to 55°".
- **"Front / behind / left / right"** must be defined in the table frame and said so, or camera perturbation changes the
  meaning of the instruction as well as the pixels.
- **Shared chunk.** True: three.js is one lazy 188 KB chunk shared with SLAM, Lite3 and the city. 70 KB of own code is
  plausible (the city is 22.7 KB).
- **Stage 0 is the right gate**, redefined: TypeScript environment + rasteriser + expert, 2 k BC trajectories from
  seeds, train in PyTorch, evaluate in node. One to two days, and it answers "can a 48 × 48 oblique view tell the cubes
  apart" before any instrument exists.
- **Estimate.** 11.5 days assumes the WebGPU path and one article. Article A alone is about the size of № 009.

## Probe

```ts
// tests/ml/zz-probe.test.ts (deleted after the run)
const model = new Transformer({ vocab: 128, ctx: T, d, heads, layers }, mulberry32(1));
// 2 warm-up runs, then the mean of 6: tape = new Tape(); model.forward(tape, ids); tape.crossEntropy(...); tape.backward();
```

```
proposal 4L d96 T172: params 487104, forward 66.7 ms, fwd+bwd 198.2 ms/sequence -> 512k sequences = 28.2 h; sequences in a 3-minute budget = 908
2 frames 4x4 patches: 3L d64 T60: params 169536, forward 8.1 ms, fwd+bwd 23.6 ms/sequence -> 512k sequences = 3.4 h; sequences in a 3-minute budget = 7621
state tokens: 2L d48 T30: params 69984, forward 1.5 ms, fwd+bwd 3.6 ms/sequence -> 512k sequences = 0.5 h; sequences in a 3-minute budget = 49809
```
