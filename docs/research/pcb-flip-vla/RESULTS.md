# pcb-flip-vla — measurements

Machine: Apple M4 Pro, macOS 26.6.2, node v22.19.0, vitest 5. Scripts are the `.test.ts.txt` files here; each says how to run it.

## Stage 0.1 — the expert and the rasteriser (`expert-probe.test.ts.txt`)

```
slip 0: success 100.0%, mean steps 24.6, lost 0, timeout 0, events {"grasped":804,"placed":804}
slip 0.01: success 100.0%, mean steps 25.0, lost 0, timeout 0, events {"grasped":891,"placed":704,"slipped":187,"dropped":187}
slip 0.02: success 100.0%, mean steps 25.7, lost 0, timeout 0, events {"grasped":1000,"placed":628,"slipped":372,"dropped":372}
slip 0.05: success 98.9%, mean steps 27.9, lost 0, timeout 11, events {"grasped":1406,"slipped":1003,"dropped":1003,"placed":394}
slip 0.1: success 88.5%, mean steps 31.8, lost 0, timeout 115, events {"grasped":2470,"slipped":2229,"dropped":2229,"placed":179}
rasteriser: 6231 frames/s (48x48, 2x2 supersampled, one thread)
```

- The expert reads the true state and re-decides every step. Up to 2 % slip it never fails in 1000 episodes; at 10 % it runs out of its 80 steps in 11.5 % of them.
- A dropped board that was past a quarter turn lands the wanted way up, so some episodes finish through a drop: at 2 % slip, 804 episodes needed a grasp, all 804 succeeded, and only 628 ended with a placement — the other 176 ended with a lucky drop. Worth a sentence in the article.
- One instruction in five is already satisfied (804 of 1000 episodes involve a grasp at all).
- The rasteriser draws the 48 × 48 view at 6 200 frames a second on one thread; the plan needs about 4 000 to keep a GPU fed, so one worker is nearly enough and two are plenty.

## Stage 0.2 — can 48 × 48 oblique pixels do the job? (behaviour cloning only)

Data: 2 000 expert trajectories from seeds 1–2000 at the default 1 % slip (50 190 frames; `export-bc.test.ts.txt`).
Model: `scripts/train-vla/model.py` — 4 frames × 36 patches, 6 instruction tokens, one proprioception token, 3 past
steps × 5 action tokens, 4 layers, d 96: 478 k parameters. PyTorch 2.14 on MPS, 3 000 steps of batch 128 in 244 s.
Held-out token accuracy (last tenth of the trajectories): yaw 0.890, shoulder 0.853, elbow 0.844, roll 0.997, grip 0.999.
Closed loop (`closed-loop.test.ts.txt`): the world, rules and pixels in node, the model answering over a pipe; seeds 100001+.

**First attempt: 0 % of real tasks.** With the grasp window I had written first (±10 mm across, 0–25 mm deep) and no
proprioception, the only successes were the instructions that needed nothing doing:

```
nothing: success 18.5% (37/200), mean steps 3.0, nothing-to-do 37/37, lost 0, ran out of steps {"closed, empty":140,"holding":23}
default slip 1 %: success 18.5% (37/200), mean steps 3.0, nothing-to-do 37/37, lost 0, ran out of steps {"closed, empty":159,"holding":4}
one shove at step 10: success 18.5% (37/200), mean steps 3.0, nothing-to-do 37/37, lost 0, ran out of steps {"closed, empty":163}
board turned back once it is right: success 18.5% (37/200), mean steps 3.0, nothing-to-do 37/37, lost 0, ran out of steps {"closed, empty":140,"holding":23}
camera 5 degrees off: success 18.5% (37/200), mean steps 3.0, nothing-to-do 37/37, lost 0, ran out of steps {"closed, empty":162,"holding":1}
```

`first-close.test.ts.txt` shows why. The model arrives near the board on schedule and closes 10–30 mm off:

```
ep 0 step 9: along 12 mm (holds 0..25), off -16 mm (holds within 10), height 3 mm (holds within 12); the expert was at "rise" -> missed
ep 1 step 8: along 34 mm (holds 0..25), off 5 mm (holds within 10), height -2 mm (holds within 12); the expert was at "rise" -> missed
ep 2 step 9: along 23 mm (holds 0..25), off 5 mm (holds within 10), height 13 mm (holds within 12); the expert was at "rise" -> missed
ep 3 step 11: along 34 mm (holds 0..25), off 11 mm (holds within 10), height -1 mm (holds within 12); the expert was at "rise" -> missed
ep 5 step 10: along 15 mm (holds 0..25), off 32 mm (holds within 10), height 13 mm (holds within 12); the expert was at "rise" -> missed
ep 6 step 10: along 18 mm (holds 0..25), off 10 mm (holds within 10), height 1 mm (holds within 12); the expert was at "rise" -> grasped
…
within one bin of the expert on every joint and the same grip: 44/320 steps
```

One pixel of the 48 × 48 view is about 12 mm on the bench. The grasp window was finer than the picture. A proprioception
token (sine and cosine of the joints, gripper state) took it from 1 held board in 23 attempts to 4 in 23: the arm knows
where it is, but the board's ±15 mm offset in its tray still has to come from pixels.

**With a grasp window at pixel scale** (±30 mm across, 0–40 mm deep, placement within 30 mm; the expert still aims for
the middle), the same checkpoint, no retraining, 100 episodes per row:

```
nothing: success 84.0% (84/100), mean steps 23.7, nothing-to-do 19/19, lost 0, ran out of steps {"open, empty":13,"closed, empty":3}
default slip 1 %: success 71.0% (71/100), mean steps 22.6, nothing-to-do 19/19, lost 0, ran out of steps {"open, empty":22,"closed, empty":7}
one shove at step 10: success 20.0% (20/100), mean steps 5.0, nothing-to-do 19/19, lost 0, ran out of steps {"closed, empty":36,"open, empty":44}
board turned back once it is right: success 19.0% (19/100), mean steps 3.0, nothing-to-do 19/19, lost 0, ran out of steps {"open, empty":58,"closed, empty":23}
camera 5 degrees off: success 44.0% (44/100), mean steps 18.2, nothing-to-do 19/19, lost 0, ran out of steps {"open, empty":37,"closed, empty":19}
```

- The gate is passed: **84 % unperturbed** from 48 × 48 pixels with 2 000 demonstrations (19 of the 100 are
  nothing-to-do instructions, all left alone).
- And the article's story is already in the table, before any of the fixes exist: one shove → only the nothing-to-do
  episodes survive (20 %); turn the board back after it has finished → it never notices (19 %); camera 5° off → 44 %;
  even the default 1 % slip costs 13 points, because a dropped board is a state BC has hardly seen.
- "within one bin of the expert on every joint" is rare in closed loop (44 of 320 steps) even when the episode succeeds:
  the model is not tracking the expert, it is doing the job its own way. Token accuracy is not the metric.
- Decision recorded: proprioception stays (real VLAs have it), the grasp window stays at pixel scale, 48 × 48 stays.

## Stage 0.3 — WebGPU: are the kernels right, and is "minutes in the page" real? (`gpu-parity.test.ts.txt`)

`components/gpu/kernels.ts`: tiled matmul with both transposed forms and a batch dimension, layer norm, prefix-masked
softmax, ReLU, add, Adam — forward and backward, f32. Run in Playwright's headless Chromium with `--enable-unsafe-webgpu`
on the M4 Pro (adapter "apple metal-3"). Reference: `lib/ml`'s Tape in f64. Worst error relative to max(1, |reference|):

```
matmul 37x29x23: forward 4.2e-7, dA 5.4e-7, dB 7.3e-7
batched q·kT: 1.9e-7
layer norm 19x24: forward 1.8e-7, dx 2.3e-7, dgain 3.4e-7, dbias 2.5e-7
softmax 13x13: causal forward 4.5e-8, backward 2.2e-8, prefix-5 forward 2.9e-8
```

That is f32 rounding and nothing else. The prefix mask has no counterpart in `lib/ml` yet, so it is checked against a
plain loop in the script.

One training step's worth of kernels (every matmul, layer norm, softmax, element-wise op and Adam update of the forward
and backward pass, on tensors of the right sizes, five steps timed after a warm-up):

```
the model as trained in stage 0.2: 4 frames, 170 tokens: 206 ms per step, 365 GFLOP/s effective; 3000 steps = 10.3 min
2 frames, 98 tokens: 105 ms per step, 372 GFLOP/s effective; 3000 steps = 5.3 min
4 frames, batch 32: 48 ms per step, 395 GFLOP/s effective; 3000 steps = 2.4 min
```

- **The recipe that reached 84 % in stage 0.2 (3 000 steps of batch 128) is about ten minutes in the page on this GPU**,
  five with two frames instead of four. PyTorch on the same GPU took 244 s, so a first, untuned WGSL backend is within
  2.5× of it. The plan's gate ("offer training when the estimate is ≤ 10 minutes") is where this machine sits; whether two
  frames cost success has to be measured in stage 1.
- The first timing was 2 197 ms a step. One kernel did it: the layer-norm gain/bias gradient re-derived every row's mean
  and variance inside each of its 96 threads. Reading the normalised input the dx kernel had just written took the step
  to 206 ms. Isolated matmuls run at 480–1 030 GFLOP/s; the whole step is at 365, so the memory-bound kernels still cost
  about half. Not tuned further at this stage.
- This measures the machine, not a trained model: the tensors hold noise and there is no data loading. Not included
  yet: the embedding gather/scatter, cross-entropy, and feeding frames (6 200 frames/s from one rasteriser thread
  against about 2 500 distinct frames/s needed at this step rate — one worker is enough).
- CI has no GPU. The script prints "NO WEBGPU ADAPTER" and stops rather than pass silently; the numbers above exist only
  where someone ran it on real hardware.

## Stage 0 verdict

1. Simulation, expert, rasteriser: done, tested. 2. 48 × 48 oblique pixels are enough once the grasp window is at pixel
scale: 84 % unperturbed, and the failure table the article is about is already there. 3. WebGPU training of that model
is ten minutes on a laptop GPU with a first-draft backend. 4. MuJoCo edge-grasp spike: not done; it does not block.
Nothing in the plan has to change except two parameters, recorded in `params.ts` (grasp window, 1 % default slip) and one
addition (a proprioception token).

## Stage 1, first pass — four recipes, and what was wrong with the set-up (`main-table.test.ts.txt`, `pipeline.sh`)

Evaluation is now batched: 64 worlds step together in node and the checkpoint answers on MPS; 300 episodes × 6
conditions take about 160 s. **Rates from here on are over the episodes that need something done** (249 of 300); the
"nothing-to-do" instructions are counted separately — every model left all 51 alone. By that count the stage-0 BC model
is 71.5 %, not 84 %: the earlier figure was 100 episodes and included the ones where doing nothing is right.

All recipes train in the same world (default 1 % slip, nobody interfering), so every disturbance is unseen by all of them.
DAgger: five rounds of 500 fresh episodes, β = 0.5, 0.3, 0.2, 0.1, 0, each round fine-tuned from the last.

```
bc [154 s]
  nothing: 71.5% (178/249, 30 steps; nothing-to-do 51/51)
  slip 1 %: 62.7% (156/249, 30 steps; nothing-to-do 51/51)
  one shove: 3.6% (9/249, 53 steps; nothing-to-do 51/51)
  shove + slip 5 %: 1.6% (4/249, 53 steps; nothing-to-do 51/51)
  board turned back: 0.0% (0/249, 0 steps; nothing-to-do 51/51)
  camera 5° off: 24.9% (62/249, 30 steps; nothing-to-do 51/51)
dart [173 s]
  nothing: 34.1% (85/249, 26 steps; nothing-to-do 51/51)
  slip 1 %: 30.9% (77/249, 26 steps; nothing-to-do 51/51)
  one shove: 0.4% (1/249, 31 steps; nothing-to-do 51/51)
  shove + slip 5 %: 0.4% (1/249, 31 steps; nothing-to-do 51/51)
  board turned back: 0.4% (1/249, 79 steps; nothing-to-do 51/51)
  camera 5° off: 3.6% (9/249, 33 steps; nothing-to-do 51/51)
dagger [161 s]
  nothing: 60.6% (151/249, 42 steps; nothing-to-do 51/51)
  slip 1 %: 55.8% (139/249, 43 steps; nothing-to-do 51/51)
  one shove: 47.8% (119/249, 58 steps; nothing-to-do 51/51)
  shove + slip 5 %: 27.3% (68/249, 55 steps; nothing-to-do 51/51)
  board turned back: 2.8% (7/249, 58 steps; nothing-to-do 51/51)
  camera 5° off: 0.0% (0/249, 0 steps; nothing-to-do 51/51)
bc+camrand [166 s]
  nothing: 36.5% (91/249, 30 steps; nothing-to-do 51/51)
  slip 1 %: 32.1% (80/249, 30 steps; nothing-to-do 51/51)
  one shove: 1.2% (3/249, 48 steps; nothing-to-do 51/51)
  shove + slip 5 %: 0.8% (2/249, 48 steps; nothing-to-do 51/51)
  board turned back: 0.0% (0/249, 0 steps; nothing-to-do 51/51)
  camera 5° off: 35.3% (88/249, 30 steps; nothing-to-do 51/51)
dagger+camrand [178 s]
  nothing: 29.7% (74/249, 45 steps; nothing-to-do 51/51)
  slip 1 %: 26.1% (65/249, 46 steps; nothing-to-do 51/51)
  one shove: 22.5% (56/249, 57 steps; nothing-to-do 51/51)
  shove + slip 5 %: 13.3% (33/249, 57 steps; nothing-to-do 51/51)
  board turned back: 0.0% (0/249, 0 steps; nothing-to-do 51/51)
  camera 5° off: 31.7% (79/249, 50 steps; nothing-to-do 51/51)
```

Success while collecting, by DAgger round (first five lines: plain; last five: with the camera randomised):

```
round: 500 episodes, 12816 frames, success on real tasks while collecting 97.6%
round: 500 episodes, 14307 frames, success on real tasks while collecting 95.1%
round: 500 episodes, 14383 frames, success on real tasks while collecting 94.7%
round: 500 episodes, 16436 frames, success on real tasks while collecting 91.8%
round: 500 episodes, 17282 frames, success on real tasks while collecting 84.3%
round: 500 episodes, 12722 frames, success on real tasks while collecting 98.7%
round: 500 episodes, 14857 frames, success on real tasks while collecting 93.1%
round: 500 episodes, 15883 frames, success on real tasks while collecting 91.4%
round: 500 episodes, 23622 frames, success on real tasks while collecting 60.4%
round: 500 episodes, 29560 frames, success on real tasks while collecting 18.9%
```

What this pass showed:

- **The effect the article is about is there.** One shove: BC 3.6 % → DAgger 47.8 %. Shove and 5 % slip: 1.6 % → 27.3 %.
- **DART with σ = 0.15 (2.4 bins) was simply too much noise**: trajectories doubled in length (57 steps on average) and
  the model got worse at everything. Retry at 0.05.
- **Fine-tuning round after round drifts.** The round-4 model scored 84.3 % while collecting round 5 under the very
  condition ("slip 1 %") where the round-5 model then scored 55.8 %. With the camera randomised the last two rounds
  collapsed (60 %, 19 %). The shipped model should be trained once, from scratch, on the aggregate.
- **"Board turned back" was 0–3 % for everyone, and that was the world's fault, not the models'.** After a flip the wrist
  rests at roll = π, and every episode had started at roll = 0, so a model back at home saw joints it had never started
  from. The start now draws the roll from 0, ±π. The condition also gets a fresh 80 steps once the board is turned, since
  it asks for the job twice.
- **Camera randomisation costs a lot with 2 000 demonstrations**: 36.5 % unperturbed for 35.3 % with the camera 5° off
  (BC: 71.5 % / 24.9 %). It does make the two numbers equal, which is what it is for; it needs more data to make them high.
- DAgger without camera randomisation is *worse* than BC when the camera moves (0 % vs 24.9 %): it has learned to lean
  harder on exactly the pixels that moved. Worth a sentence in the article if it survives the second pass.

Second pass (running): start roll randomised, 4 000 demonstrations and 4 000 steps for the expert-data recipes, DART at
σ = 0.05, DAgger's final model retrained from scratch on the aggregate for 5 000 steps.

## Stage 1, second pass — the table the article will be written from

Changes from the first pass: the wrist starts at 0 or ±π; "board turned back" gets a fresh 80 steps; 4 000 demonstrations
and 4 000 steps for the expert-data recipes; DART at σ = 0.05; DAgger's shipped model trained once from scratch on the
aggregate (4 000 demonstrations + five rounds of 500 episodes) for 5 000 steps. The expert in the new world
(`expert-probe`, 1000 seeds): 

```
slip 0: success 100.0%, mean steps 24.6, lost 0, timeout 0, events {"g
slip 0.01: success 100.0%, mean steps 24.9, lost 0, timeout 0, events 
slip 0.02: success 100.0%, mean steps 25.5, lost 0, timeout 0, events 
slip 0.05: success 99.0%, mean steps 27.7, lost 0, timeout 10, events 
slip 0.1: success 88.2%, mean steps 31.6, lost 0, timeout 118, events
```

```
bc [172 s]
  nothing: 35.7% (89/249, 30 steps; nothing-to-do 51/51)
  slip 1 %: 32.5% (81/249, 30 steps; nothing-to-do 51/51)
  one shove: 7.6% (19/249, 64 steps; nothing-to-do 51/51)
  shove + slip 5 %: 5.2% (13/249, 64 steps; nothing-to-do 51/51)
  board turned back: 7.6% (19/249, 61 steps; nothing-to-do 51/51)
  camera 5° off: 14.1% (35/249, 36 steps; nothing-to-do 51/51)
dart [177 s]
  nothing: 31.7% (79/249, 30 steps; nothing-to-do 51/51)
  slip 1 %: 28.5% (71/249, 31 steps; nothing-to-do 51/51)
  one shove: 6.4% (16/249, 64 steps; nothing-to-do 51/51)
  shove + slip 5 %: 4.0% (10/249, 64 steps; nothing-to-do 51/51)
  board turned back: 2.4% (6/249, 62 steps; nothing-to-do 51/51)
  camera 5° off: 0.0% (0/249, 0 steps; nothing-to-do 51/51)
dagger [160 s]
  nothing: 82.7% (206/249, 41 steps; nothing-to-do 51/51)
  slip 1 %: 79.1% (197/249, 43 steps; nothing-to-do 51/51)
  one shove: 53.4% (133/249, 58 steps; nothing-to-do 51/51)
  shove + slip 5 %: 32.9% (82/249, 60 steps; nothing-to-do 51/51)
  board turned back: 61.4% (153/249, 49 steps; nothing-to-do 51/51)
  camera 5° off: 0.0% (0/249, 0 steps; nothing-to-do 51/51)
bc+camrand [173 s]
  nothing: 26.1% (65/249, 30 steps; nothing-to-do 51/51)
  slip 1 %: 24.1% (60/249, 30 steps; nothing-to-do 51/51)
  one shove: 0.0% (0/249, 0 steps; nothing-to-do 51/51)
  shove + slip 5 %: 0.0% (0/249, 0 steps; nothing-to-do 51/51)
  board turned back: 0.4% (1/249, 62 steps; nothing-to-do 51/51)
  camera 5° off: 26.5% (66/249, 30 steps; nothing-to-do 51/51)
dagger+camrand [171 s]
  nothing: 31.3% (78/249, 37 steps; nothing-to-do 51/51)
  slip 1 %: 28.5% (71/249, 38 steps; nothing-to-do 51/51)
  one shove: 19.7% (49/249, 48 steps; nothing-to-do 51/51)
  shove + slip 5 %: 13.3% (33/249, 48 steps; nothing-to-do 51/51)
  board turned back: 4.8% (12/249, 43 steps; nothing-to-do 51/51)
  camera 5° off: 28.1% (70/249, 40 steps; nothing-to-do 51/51)
```

Success while collecting, by round (fine-tuned models; first five plain, last five with the camera randomised):

```
round: 500 episodes, 13000 frames, success on real tasks while collecting 99.7%
round: 500 episodes, 15207 frames, success on real tasks while collecting 96.8%
round: 500 episodes, 16844 frames, success on real tasks while collecting 93.4%
round: 500 episodes, 18947 frames, success on real tasks while collecting 85.5%
round: 500 episodes, 25025 frames, success on real tasks while collecting 43.5%
round: 500 episodes, 13037 frames, success on real tasks while collecting 100.0%
round: 500 episodes, 15566 frames, success on real tasks while collecting 96.8%
round: 500 episodes, 18493 frames, success on real tasks while collecting 84.6%
round: 500 episodes, 30090 frames, success on real tasks while collecting 23.2%
round: 500 episodes, 29895 frames, success on real tasks while collecting 16.2%
```

- **DAgger against BC, with nobody interfering: 82.7 % against 35.7 %.** Shoved: 53.4 % against 7.6 %. Board turned back:
  61.4 % against 7.6 %. Same architecture, same number of parameters, same training world.
- **BC got worse than in the first pass (71.5 % → 35.7 %) although it has twice the data.** The world got harder: the wrist
  now starts any of three ways up, so the approach has three variants. BC's typical failure is unchanged — it closes a
  little off, misses, and has never seen "gripper shut on nothing". This is compounding error with no one pushing.
- **DART did nothing here (31.7 %), at either noise level.** Noise on the joints teaches "drifted → steer back", but the
  expert re-aims before it closes, so DART data still contains no missed grasp and no empty closed gripper — the states
  BC actually dies in. DAgger's data has them because the model puts itself there. That contrast is worth a paragraph.
- **Fine-tuning round after round still drifts** (43.5 % and 16.2 % in the last rounds); training once on the aggregate does
  not (82.7 %). The rounds are for collecting states, not for producing the model.
- **The camera.** DAgger goes from 82.7 % to 0 % when the camera is 5° off. The camera-randomised recipes are flat across
  that shift (26 % / 27 % and 31 % / 28 %) but low: with this much data and this small a model, invariance is bought with
  most of the accuracy. A 12 000-step run on the same aggregate is in progress to see whether it is data or training time.
- Shipped for now: `public/vla/bc-v2`, `dart-v2`, `dagger-v2` (1.91 MB each, f32). `tests/vla/policy.test.ts` holds the
  TypeScript forward pass to PyTorch's logits (< 2e-3) and tokens on five moments of expert episodes.

## The camera question has an answer: it was training time

The same camera-randomised aggregate as "dagger+camrand" above (4 000 camera-jittered demonstrations + five DAgger rounds
of 500), trained from scratch for **12 000 steps instead of 5 000** (964 s on MPS):

```
dagger+camrand-12k [124 s]
  nothing: 90.0% (224/249, 39 steps; nothing-to-do 51/51)
  slip 1 %: 81.1% (202/249, 39 steps; nothing-to-do 51/51)
  one shove: 90.0% (224/249, 45 steps; nothing-to-do 51/51)
  shove + slip 5 %: 57.0% (142/249, 48 steps; nothing-to-do 51/51)
  board turned back: 82.3% (205/249, 36 steps; nothing-to-do 51/51)
  camera 5° off: 93.6% (233/249, 39 steps; nothing-to-do 51/51)
```

Best model so far on every column, and flat across the camera shift (90.0 % straight, 93.6 % at 5°). Shipped as
`public/vla/dagger-cam-v2`.

**Not a fair comparison yet.** The other recipes had 4 000–5 000 steps. Before the article says "camera randomisation also
helps with shoves", BC, DART and plain DAgger need the same 12 000 steps; it may be that all of them were under-trained
and that part of DAgger's lead over BC shrinks. That rerun is the first thing to do (about 16 minutes each).

## Stage 1, third pass — every recipe at the same 12 000 steps (2026-09-21, the main session)

The handover's first worry: the second pass compared 4 000–5 000 steps with each other and then a 12 000-step model beat
them all, so "DAgger 82.7 % against BC 35.7 %" might have been a budget, not a method. Same data as the second pass
(`vla-work/bc`, `dart`, `bc-cam`, and `bc` + `dagger-r1…r5`), each trained once from scratch for 12 000 steps
(`vla-work/rerun-12k.sh`; 15–18 minutes a model on MPS with the GPU to itself), one seed, 300 episodes, 249 real tasks.

```
bc [165 s]
  nothing: 54.6% (136/249, 30 steps; nothing-to-do 51/51)
  slip 1 %: 49.4% (123/249, 30 steps; nothing-to-do 51/51)
  one shove: 9.6% (24/249, 60 steps; nothing-to-do 51/51)
  shove + slip 5 %: 5.2% (13/249, 59 steps; nothing-to-do 51/51)
  board turned back: 1.2% (3/249, 66 steps; nothing-to-do 51/51)
  camera 5° off: 9.6% (24/249, 33 steps; nothing-to-do 51/51)
dart [167 s]
  nothing: 57.8% (144/249, 33 steps; nothing-to-do 51/51)
  slip 1 %: 55.4% (138/249, 33 steps; nothing-to-do 51/51)
  one shove: 2.8% (7/249, 62 steps; nothing-to-do 51/51)
  shove + slip 5 %: 1.6% (4/249, 58 steps; nothing-to-do 51/51)
  board turned back: 6.4% (16/249, 41 steps; nothing-to-do 51/51)
  camera 5° off: 1.6% (4/249, 29 steps; nothing-to-do 51/51)
dagger [128 s]
  nothing: 98.4% (245/249, 35 steps; nothing-to-do 51/51)
  slip 1 %: 98.8% (246/249, 36 steps; nothing-to-do 51/51)
  one shove: 97.2% (242/249, 45 steps; nothing-to-do 51/51)
  shove + slip 5 %: 73.9% (184/249, 50 steps; nothing-to-do 51/51)
  board turned back: 97.6% (243/249, 34 steps; nothing-to-do 51/51)
  camera 5° off: 0.0% (0/249, 0 steps; nothing-to-do 51/51)
bc+camrand [177 s]
  nothing: 57.8% (144/249, 31 steps; nothing-to-do 51/51)
  slip 1 %: 51.8% (129/249, 31 steps; nothing-to-do 51/51)
  one shove: 5.2% (13/249, 68 steps; nothing-to-do 51/51)
  shove + slip 5 %: 2.0% (5/249, 76 steps; nothing-to-do 51/51)
  board turned back: 6.0% (15/249, 41 steps; nothing-to-do 51/51)
  camera 5° off: 56.2% (140/249, 30 steps; nothing-to-do 51/51)
   Duration  640.26s (tests 100%)
```

- **It was the method.** Three times the training took BC from 35.7 % to 54.6 % with nobody interfering and left it at
  9.6 % after one shove and 1.2 % when the board is turned back. DAgger on the aggregate: 98.4 %, 97.2 %, 97.6 %.
  Extra steps help a model do what its data shows and do nothing for what its data never shows.
- **DART is BC** (57.8 % / 2.8 % shoved), now at a fair budget too. The explanation (its data still contains no missed
  grasp) is still reasoning; the count is still owed.
- **The camera is a separate axis, as before.** DAgger: 0 % with the camera 5° off. BC with a shaken camera: 56.2 %
  there, equal to its own 57.8 % untouched, and as helpless as BC when shoved (5.2 %). The second pass's
  camera-randomised DAgger at 12 000 steps (90 % / 90 % / 82.3 % / 93.6 %) remains the only model good on every column.
- Still one seed and no error bars. Checkpoints not exported: the article changed direction the same day (see
  `docs/research/head-camera/RESULTS.md`), and these numbers are here because whichever article is written will want
  to say what three times the training does and does not buy.
