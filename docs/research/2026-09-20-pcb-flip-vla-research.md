# № 010 research, second pass — train on WebGPU when the reader has it, and the task becomes flipping a PCB

2026-09-20. Follows `2026-09-20-vla-recovery-proposal-review.md`. Nothing was built; one thing was measured.
Two decisions from Paul frame this pass: (1) train in the page when WebGPU is there, otherwise load a checkpoint;
(2) the arm's job is to turn a PCB over.

## 1. WebGPU: measured, and my earlier estimate was too low

A plain 16 × 16 tiled matrix-multiply shader (the first thing anyone writes, no tuning), in headless Chromium on the
Apple M4 Pro, f32, 20 dispatches timed with `onSubmittedWorkDone`, one result read back and checked each time:

| shape (rows = batch 128 × 172 tokens) | time | throughput |
| --- | --- | --- |
| attention projections, 22 016 × 96 → 96 | 0.85 ms | 477 GFLOP/s |
| FFN up, 22 016 × 96 → 384 | 1.68 ms | 966 GFLOP/s |
| FFN down, 22 016 × 384 → 96 | 1.62 ms | 1 005 GFLOP/s |
| batch 16 instead of 128, 2 752 × 96 → 384 | 0.23 ms | 902 GFLOP/s |
| reference, 1024³ | 2.08 ms | 1 032 GFLOP/s |

Last pass I guessed 200–400 GFLOP/s for a hand-written kernel. It is 480–1 030. `lib/ml` on the CPU does about 2.7.

What that means for the proposal's model (487 k parameters, 172 tokens, batch 128, about 6.7 × 10¹⁰ FLOPs a step):
the matrix multiplies alone are ~0.07–0.1 s a step. Layer norm, softmax, the element-wise ops and the optimiser are
memory-bound and will roughly double it. Call it **0.13–0.2 s a step, 9–13 minutes for 4 000 steps on this GPU**, and
about 5 minutes if the frames go from four to two (≈ 100 tokens). The proposal's "4–5 minutes" is within a factor of
two, not a factor of three hundred. **Training the pixel model in the page is feasible on a laptop-class GPU.**

It is not feasible everywhere. Integrated Intel graphics and phones are 5–20× slower, and thermally limited. So the
gate is not "is there a GPU" but "how long would it take here":

```
navigator.gpu → requestAdapter → requestDevice → 200 ms of this same matmul
  → "about N minutes on your GPU"           N ≤ 10: offer training, checkpoint one click away
                                            N > 10 or no WebGPU: checkpoint by default, "train anyway" behind a warning
```

Availability in 2026: Chrome and Edge (desktop, Android), Safari 26 (macOS, iOS), Firefox on Windows. Most readers have it.

### What has to be built

`lib/ml` has no GPU code. The GPU path is a second backend for the same tape:

- Kernels (forward and backward of each): matmul with the two transposed variants the backward pass needs, batched
  matmul for attention, add / bias, layer norm, softmax with a prefix mask, ReLU, embedding gather and scatter-add,
  cross-entropy, Adam. About a dozen shaders, tensors flattened as [batch × tokens, d].
- f32 only. The CPU engine is f64, which makes it the reference: every kernel is checked against `lib/ml` on small
  shapes (forward to 1e-4, gradients to 1e-3 relative), and `lib/ml`'s gradients are already checked against finite
  differences. The chain of trust stays intact.
- **Those parity tests cannot run in vitest** (no WebGPU in node). They run in Playwright with
  `--enable-unsafe-webgpu`. GitHub's Ubuntu runners have no GPU; Chrome can fall back to SwiftShader's Vulkan there,
  which is slow and sometimes absent. Plan for: run locally and in CI when an adapter exists, skip with a loud message
  when it does not. This is the weakest link in "every number reproducible" and the article should say so.
- One checkpoint format (f32) for both paths; CPU inference (67 ms a forward at the proposed size) serves readers
  without a GPU and the node evaluation scripts.
- Feeding the GPU. Observations come from the CPU rasteriser (next section's argument for it still holds: node, tests
  and the no-GPU path need the same pixels). A step needs up to 512 distinct 48 × 48 frames; the rasteriser has to
  sustain ~4 000 frames/s across workers or the GPU waits. Measure in stage 0. Frames are shared by up to four
  consecutive samples, so a small cache helps.

Size of the job: one to two weeks, and it is a reusable asset — articles 004 (Transformer) and 007 (diffusion) could
train on it too. It is also an article in its own right ("the same autodiff, moved to the GPU"). Decide whether it ships
inside № 010 or before it.

## 2. The task: turn a PCB over

### Why it is a better task than moving cubes

- Success is visible at a glance and at 48 × 48: the board is either component-side up or solder-side up.
- The recovery cases are natural rather than staged: the board slips mid-roll; it lands half-turned; someone turns it
  back. "Which side is up" and "how far round am I" are exactly what the model has to read from pixels and history.
- An instruction can be a no-op ("make it solder-side up" when it already is), which tests grounding, not just motion.
- It is a real factory job — with a caveat the article must state: on an SMT line boards are turned by an inverter
  conveyor, not an arm. Arms turn boards in test, inspection and rework cells, in small batches. That is the honest frame.

### What changes from the cube world

A board lying flat cannot be picked up by a gripper pointing straight down, and turning it over needs a roll. So the
2.5-D world goes, and with it "gripper always vertical".

- **Nest.** The board (100 × 70 mm, drawn 4 mm thick so it survives 48 × 48) rests on two rails in a shallow tray,
  30 mm above the bench, so its near edge is free. The tray's walls funnel a dropped board back in, within ±10° of
  yaw and ±15 mm — which is what makes re-grasping possible without a wrist-yaw joint.
- **Arm.** Base yaw, shoulder, elbow, wrist roll, gripper: five outputs. Wrist pitch is slaved so the gripper stays
  level (the counterpart of the first proposal's "always vertical"). The gripper approaches along the radius from the
  base, so the nest faces the base.
- **The motion.** Approach the near edge at mid-line → close → lift at least half the board's depth plus margin
  (≥ 50 mm) → roll 180° → lower onto the rails → open → retreat. Gripping the middle of the edge and rolling about the
  radial axis turns the board about its own centre line, so it comes down in the footprint it left.
- **Roll needs its own step size.** At the proposal's ±0.08 rad a step, 180° is 39 steps. Per-joint ranges: ±0.4 rad
  for roll (8 steps), ±0.08 for the others. Episode ≈ 35–40 steps; limit 80.
- **Physics: kinematic, with rules** (as the cube world was). Held board = gripper pose. Rules that create the failures:
  - a grasp holds only if the jaws close within ±10 mm of the edge's mid-line and within 12° of square; otherwise the
    board is nudged;
  - slip: a per-step probability while held, higher the faster the roll — so speed has a price;
  - a dropped board falls into the tray; which side is up is decided by the roll angle at the moment (past 90°: turned);
  - rolling below clearance jams against the rails: the roll stops until the board is lifted.
- **Look.** Component side green with three to five coloured parts and a white mark; solder side copper-tan with pad
  dots. Two nests side by side allow "turn the left board solder-side up".
- **Language.** `把{左|右}邊的板子翻到{正面|背面}朝上`, `把{左|右}邊的板子翻面`. Vocabulary under 20. One in five
  instructions is already satisfied.
- **Success.** Board in its nest, requested side up, gripper open and clear, within 80 steps.
- **Perturbations for the console.** Shove the arm; nudge the board in its tray; **turn the board back by hand** (the
  purest test: nothing about the arm changed, only what the camera sees); tilt the camera.
- **Tokens.** 5 action tokens a step; history 3 steps = 15; instruction ≤ 10; images as before.

### What I expect to be hard (to find out in stage 0, not to assume)

- Mid-roll the board is edge-on to an oblique camera and nearly invisible; the gripper hides part of it. Whether the
  model can tell 60° from 120° of roll from pixels, or has to rely on its own action history, is an open question — and
  a good section either way (the first proposal's §9, "why history is needed", gets a real example).
- The expert is a longer state machine than pick-and-place (approach, grasp, lift, roll, lower, release, retreat, plus
  re-entry from every failure). Its success rate under slip has to be measured before any threshold is written into a test.
- With BC data the roll is always 0° → 180° in one go. A board dropped at 100° and lying turned is a state BC has
  never seen with the gripper empty above it. That is the distribution-shift story, and it should show up in the
  state-cloud figure as a gap — if it does not, the task is too easy and the slip rule needs teeth.

### The MuJoCo option

The repo already ships MuJoCo WASM (Lite3) and runs it under vitest in node. Real contact would make slips come from
friction instead of a dice roll, which is a much stronger demo. Against it: gripping a thin plate by its edge is
finicky in soft-contact simulators (pad friction, `condim`, penetration), a scripted expert on top of that is harder to
make reliable, and it is a 4.5 MB download. Recommendation: kinematic rules first; a half-day spike to see whether a
stable edge grasp and roll is achievable in MuJoCo at all. If it is, it becomes the "what differs from the real thing"
section's upgrade, or the sequel.

## 3. What still stands from the first review

- Observations from a TypeScript z-buffer rasteriser, not three.js + `readPixels`: the same pixels in node, worker and
  tests. three.js is for the scene the reader looks at.
- A dataset is a list of seeds, not a download.
- Reach has to be checked by a test for every instruction the grammar can produce (smaller bench: 0.6 × 0.5 m).
- The ablation list is 40–50 trained models. On this GPU that is a day of compute if scripted through Playwright;
  PyTorch remains the practical tool for the offline tables, with a golden test tying its forward pass to `lib/ml`'s.
- It is still more than one article. With the GPU backend in scope the natural order is:
  (a) the GPU backend, shown by retraining article 004's Transformer on it; (b) the PCB flipper: BC / DART / DAgger and
  the console; (c) what it sees: camera randomisation, attention, the god's-eye ablation.
- Title: nothing "stands up". 「推它一下，它自己翻回來」keeps the hook and is true of this task.

## 4. Stage 0, redefined (2–3 days, no instruments)

1. The flip world, the expert, the rasteriser, in TypeScript, with tests (reach, determinism, expert success under slip — measured).
2. 2 000 BC trajectories from seeds; train the proposed model and the 2-frame variant in PyTorch; evaluate in node.
   Question answered: can a 48 × 48 oblique view tell the sides apart and follow the roll?
3. WebGPU spike: matmul, layer norm and softmax kernels with their backward passes, parity against `lib/ml`, and one
   real number — seconds per training step at batch 128 in the page. Question answered: is 5–10 minutes real?
4. Half a day: can MuJoCo hold a board by its edge?

Only then choose the article split and write the build prompt.
