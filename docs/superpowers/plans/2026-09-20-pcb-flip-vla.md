# № 010 `pcb-flip-vla` — build plan

Decided by Paul on 2026-09-20: **one article**; **kinematic rules first** (MuJoCo is a side question); stage 0 as below.
Background and measurements: `docs/research/2026-09-20-vla-recovery-proposal-review.md` and
`docs/research/2026-09-20-pcb-flip-vla-research.md`. Read those, then `docs/HANDOFF.md`, `docs/DESIGN.md`, `AGENTS.md`.
№ 009 (`content/posts/city-of-agents`, PR #9) is the closest template for structure, tests and research scripts.

## 0. The article in one sentence

A model that can do the job and a model that can recover have the same architecture; the difference is whether the data
contains mistakes. A small VLA learns from 48 × 48 pixels to turn a PCB over; the reader shoves it, turns the board
back, tilts its camera, and watches which of four training recipes climbs back. It trains in the page when the reader's
GPU can do it in minutes, and loads a checkpoint when it cannot.

## 1. Branch and delivery

- Worktree `/Users/paul_jiang/Desktop/Paul/Blog-vla`, branch `feat/pcb-flip-vla` off `dev`. PR goes to `dev`. Never push
  `dev` or `main`; force-push only this branch and only when Paul says so.
- `draft: true`, `no: 10`. Drafts 404 in the production build: the smoke test skips on 404, the page is not added to
  `e2e/a11y.spec.ts` until publication, and axe / bundle numbers are taken against `next dev` and reported as such.
- The main session is changing every article's `components/index.ts`. Ours stays plain re-exports until it says otherwise.
- One commit per stage; `pnpm lint && pnpm typecheck && pnpm test` before the next; every UI stage looked at with
  Playwright (1440 and 390, both themes, console read once). The Playwright MCP browser is usually taken: use a node
  script with `@playwright/test` from inside the worktree.

## 2. Layout (kebab-case, as the other articles)

```
content/posts/pcb-flip-vla/
  zh.mdx, en.mdx                 draft
  components/
    index.ts  labels.ts
    sim/                         pure TypeScript: no three, React, DOM, Math.random (mulberry32 from @/lib/ml)
      types.ts  params.ts        every number the article quotes
      arm.ts                     forward kinematics, closed-form IK, joint limits, reach
      world.ts                   bench, nests, boards, the kinematic rules, step(action), perturbations
      expert.ts                  the re-evaluating state machine
      raster.ts                  z-buffer rasteriser → Uint8Array 48×48×3 (the model's eyes, everywhere)
      language.ts                grammar, vocabulary, tokeniser
      tokens.ts                  action bins ↔ joint deltas; sequence layout
      data.ts                    BC / DART / DAgger / CamRand collection from seeds
      policy.ts                  CPU inference on lib/ml (prefix mask, KV cache for the action tokens)
    gpu/                         the WebGPU backend (see §5)
    arm-view3d.ts                three.js scene the reader looks at
    *-lab.tsx                    the figures
lib/ml/                          new op: softmax with a prefix mask (+ finite-difference test)
scripts/train-vla/               PyTorch, run with uv as scripts/train-mnist is; exports f32 weights + golden values
public/vla/                      checkpoints, fetched on demand, versioned file names
tests/vla/                       vitest
e2e/                             smoke test (skips while draft); GPU parity spec (skips without an adapter, loudly)
docs/research/pcb-flip-vla/      *.test.ts.txt probes, RESULTS.md
```

## 3. The world (kinematic, rules in `params.ts`)

- Bench 0.6 × 0.5 m. Arm base at the far edge, observation camera at the near edge (the arm reaches towards the camera
  and hides less). Camera pitch 45°, FOV 40°; perturbation ±5°, ±30 mm.
- Two nests side by side. Each is a shallow tray with two rails 30 mm above the bench; the near edge of the board is
  free. Tray walls funnel a dropped board back within ±10° yaw and ±15 mm. Nests face the arm base.
- Board 100 × 70 mm, drawn 4 mm thick. Component side green with 3–5 coloured parts and a white mark; solder side
  copper-tan with pad dots. Side up is a boolean; yaw and offset within the tray are continuous.
- Arm: base yaw, shoulder, elbow, wrist roll, gripper. Wrist pitch is slaved so the gripper stays level. Link lengths
  chosen so that **every pose the grammar can ask for is reachable — asserted by a test**.
- Action per step: Δyaw, Δshoulder, Δelbow ∈ ±0.08 rad, Δroll ∈ ±0.4 rad, 32 bins each; gripper open/close. 5 tokens.
- Rules: a grasp holds only within ±10 mm of the edge mid-line and 12° of square, otherwise the board is nudged; while
  held, slip probability per step = base (2 %, 0–10 % knob) × (1 + roll speed term); a dropped board falls into its tray
  and is turned if the roll was past 90°; rolling below 50 mm clearance jams (roll does not advance); release only
  counts over the rails.
- Success: requested board in its nest, requested side up, gripper open and clear, within 80 steps. One instruction in
  five is already satisfied (the right answer is to do nothing).
- Perturbations: shove the arm (joint jump ≈ 80 mm at the tip), nudge the board in its tray, **turn the board back**,
  tilt the camera, execution noise σ.
- Language: `把{左|右}邊的板子翻到{正面|背面}朝上`, `把{左|右}邊的板子翻面`; English equivalents; vocabulary < 20.

## 4. Model and data

- Sequence: `[patches × frames][instruction ≤ 10][3 past steps × 5][current 5]`. Images and instruction fully visible,
  actions causal (prefix mask). Decoder, pre-LN, d 96, 4 layers, 6 heads, FFN 384 as the starting point; the 2-frame /
  12-px-patch variant is the fallback. Stage 0 picks.
- Sample = k frames + history + instruction → 5 action tokens; loss = mean of 5 cross-entropies.
- Datasets are seeds + mode. BC: expert acts, expert labels. DART: expert + noise acts, clean expert labels. DAgger:
  model acts (β-mixed), expert labels, 5 rounds. CamRand: any of these with the camera jittered per trajectory
  (±8°, ±50 mm).
- Offline training and every table: PyTorch in `scripts/train-vla/`, fed by `.npy` written from node. A golden test
  pins `policy.ts`'s forward pass to PyTorch's logits. DAgger rollouts run in node on each round's exported weights.
- Checkpoints: f32, one per recipe (BC, DART, DAgger, DAgger+CamRand), each stamped with commit, seed and training
  environment. Try int8 + per-matrix scale; ship it only if the success-rate table does not move.

## 5. WebGPU backend (`components/gpu/`)

- A second backend for the same computation: WGSL kernels with forward and backward for matmul (and the two transposed
  forms), batched matmul, add/bias, layer norm, prefix-masked softmax, ReLU, embedding gather / scatter-add,
  cross-entropy, Adam. f32. Tensors live in GPU buffers; only the loss comes back each step.
- Reference = `lib/ml` (f64, itself checked against finite differences). Parity on small shapes: forward 1e-4,
  gradients 1e-3 relative. Runs in Playwright with `--enable-unsafe-webgpu`; **skips with an explicit message when no
  adapter exists** (GitHub runners). The article says which numbers depend on this.
- Gate in the page: `navigator.gpu` → adapter → device → 200 ms matmul → "about N minutes on your GPU". N ≤ 10: training
  offered, checkpoint one click away. Otherwise checkpoint by default and "train anyway" behind a warning.
- Feeding: the CPU rasteriser in workers, frames cached across the up-to-four samples that share them. Target: the GPU
  never waits; measured in stage 0.
- It lives beside the article first. Moving it to `lib/ml/gpu` so 004 and 007 can use it is a later, separate change.

## 6. One article: what is in, what is out

Budget: ≤ 10 minutes, five figures (№ 009 has five and reads at 9–10).

| § | section | figure |
| --- | --- | --- |
| 0 | Push it (20-second opener: BC freezes, DAgger goes round again; turn the board back; tilt the camera) | **console**, four checkpoints side by side |
| 1 | What it sees, what it says: patches, words, action bins, one decoder | **expert + the 48 × 48 inset** |
| 2 | An expert that tries again (state machine, IK; it reads the true state — remember that) | same figure |
| 3 | Learning from the expert, and three ways to die | **state cloud**: where BC / DART / DAgger data has been |
| 4 | Feeding it mistakes: shaky hands (DART), the model errs and the expert marks it (DAgger), a shaky camera (CamRand) — and why the first two cannot fix the third | **train** (GPU or checkpoint), then back to the console |
| 5 | What it looks at; why it needs the last few frames | **attention** over the inset |
| 6 | What differs from the real thing (inverter conveyors; kinematic rules; π0 / OpenVLA in one paragraph), how the numbers were measured, the GPU backend in a paragraph and a sidenote | — |

Out of the article, kept as tables in RESULTS.md and quoted where needed: the god's-eye ablation, bins 8/32/128,
resolution 32/48/64, data scale 2 k / 20 k / 200 k. The diffusion action head stays a sequel.

## 7. Numbers (`docs/research/pcb-flip-vla/`, seeds fixed, 3 seeds, mean and range)

Test set: 300 scenes. Levels: none / one shove / shove + 5 % slip / board turned back / camera 5° / all.
Main table: 4 recipes × 6 levels, success and mean steps. DAgger by round. k = 1 / 2 / 4. Data scale for BC.
In the page, live: rasteriser frames/s, training samples/s, inference ms/step, estimated minutes.
Every "~" in the proposal is replaced by a measurement; if a result goes the other way, the text changes.

## 8. Stage 0 — the gate (2–3 days, no figures)

1. `sim/`: arm, world, expert, rasteriser, language, tokens + tests: reach for every instruction, determinism, the
   rules, expert success under 0 / 2 / 10 % slip **measured, then asserted**, rasteriser golden image and frames/s.
2. 2 000 BC trajectories from seeds → `.npy` → PyTorch → evaluate in node. Answer: can 48 × 48 oblique pixels tell the
   sides apart and follow the roll? BC unperturbed < 75 %: try 64 × 64, then a steeper camera, and record why.
3. WebGPU spike: matmul, layer norm, masked softmax with backward passes, parity against `lib/ml`, and one number:
   seconds per step at batch 128 in the page on the M4 Pro. Answer: is 5–10 minutes real?
4. Half a day, does not block: can MuJoCo (already in the repo) hold a board by its edge and roll it?

Report to Paul with the numbers before stage 1. If 2 or 3 fails, the plan changes before any figure is drawn.

## 9. Stages after the gate

1. Data modes, full PyTorch pipeline, golden test, the four checkpoints, RESULTS.md main table.
2. GPU backend complete, parity spec, training in a worker, the gate.
3. `arm-view3d` + console (checkpoints only).
4. Expert / inset figure, state cloud, train figure, attention figure.
5. Prose zh + en, cover drawing, smoke test, bundle and axe numbers, PR to `dev`.

## 10. Acceptance

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e` pass (draft tests skip, GPU spec skips without an adapter).
- First load contains no three.js, no checkpoint, no GPU code; own code reported in gzip KB as № 009 did.
- The page never trains without being asked, never blocks the main thread for more than a frame, and works with no
  WebGPU at all.
- axe clean in both themes against `next dev`; controls ≥ 24 px, named, keyboard-operable; reduced motion respected.
- Every number in the text is attributed: live / on my machine / offline with seeds and script.
