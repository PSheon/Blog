# pcb-flip-vla — handover, 2026-09-21

Written by the session that built stages 0 and 1, for the main session taking the article over at Paul's request.
Plan: `docs/superpowers/plans/2026-09-20-pcb-flip-vla.md`. Every measurement and the reasoning behind each change of
course: `RESULTS.md` beside this file — read it top to bottom once; it is a lab notebook, in order.

## Where things are

| | |
| --- | --- |
| Stage 0 (gate) | done: sim + expert + rasteriser (tests), BC from pixels, WebGPU kernels with parity and a timed step. MuJoCo spike not done, not needed. |
| Stage 1 | done twice over: four recipes, main table, DAgger rounds, CPU forward pass with golden test, four checkpoints in `public/vla/`. **Open: equal-step rerun, 3 seeds, DAgger-by-round curve, k-frames ablation.** |
| Stage 2 (GPU backend) | only the stage-0 kernels exist (`components/gpu/kernels.ts`). No embedding gather/scatter, no cross-entropy, no tape wiring, no training loop, no gate UI. |
| Stage 3–5 | not started. The draft page has ONE figure (the bench in a worker, expert or a checkpoint driving). No three.js scene, no console of four, no state cloud, no train figure, no attention figure, no prose, no `en.mdx`, no cover, no smoke test. |

## Reproduce

Python is `uv` (0.8.22) with `--with torch --with numpy`; PyTorch 2.14, **MPS** (falls back to CUDA or CPU; CPU works but
a 5 000-step run takes hours). Nothing is `.npy`: a dataset is a directory with `frames.u8` (48·48·3 bytes a frame) and
`meta.json`. Datasets and runs live OUTSIDE the repo; you choose the directory.

```sh
sh scripts/train-vla/pipeline.sh /some/work/dir      # everything below, idempotent, ~80 min on an M4 Pro
```

What the pipeline does, by hand (each research script is a `.test.ts.txt` that is copied into `tests/vla/`, run with
vitest, and deleted — the header of each file has its exact command):

```sh
# expert data (VLA_MODE=bc|dart, VLA_NOISE, VLA_CAMRAND=1, VLA_SEED0)
cp docs/research/pcb-flip-vla/export-bc.test.ts.txt tests/vla/export-bc.test.ts
VLA_OUT=$W/bc VLA_N=4000 pnpm exec vitest run tests/vla/export-bc.test.ts --disable-console-intercept; rm tests/vla/export-bc.test.ts
# train
(cd scripts/train-vla && uv run --with torch --with numpy python train.py --data $W/bc --out $W/run-bc --steps 4000)
# one DAgger round (model in the loop, expert labels)
cp docs/research/pcb-flip-vla/dagger-round.test.ts.txt tests/vla/dagger-round.test.ts
VLA_MODEL=$W/run-bc/model.pt VLA_OUT=$W/dagger-r1 VLA_SEED0=201000 VLA_N=500 VLA_BETA=0.5 pnpm exec vitest run tests/vla/dagger-round.test.ts --disable-console-intercept
(cd scripts/train-vla && uv run … train.py --data $W/bc,$W/dagger-r1 --init $W/run-bc/model.pt --out $W/run-dagger-r1 --steps 1500 --lr 5e-4)
```

**Not in `pipeline.sh`:**

```sh
# the main table (batched: 64 worlds in node, the checkpoint on MPS over a pipe; ~160 s per model)
cp docs/research/pcb-flip-vla/main-table.test.ts.txt tests/vla/main-table.test.ts
VLA_MODELS="bc=$W/run-bc/model.pt,dagger=$W/run-dagger/model.pt" VLA_EPISODES=300 pnpm exec vitest run tests/vla/main-table.test.ts --disable-console-intercept; rm tests/vla/main-table.test.ts
# the 12 000-step camera run that produced dagger-cam-v2
(cd scripts/train-vla && uv run … train.py --data $W/bc-cam,$W/dagger-cam-r1,…,$W/dagger-cam-r5 --out $W/run-dagger-cam-long --steps 12000)
# a checkpoint for the page (+ golden values: only for the checkpoint named in tests/fixtures/vla-golden.json, currently bc-v2)
(cd scripts/train-vla && uv run … export.py --model $W/run-bc/model.pt --out ../../public/vla/bc-v2 --label bc --golden ../../tests/fixtures/vla-golden.json --data $W/bc)
# expert success by slip; where a checkpoint first closes its gripper; GPU parity + step timing (needs a dev server and a GPU)
docs/research/pcb-flip-vla/{expert-probe,first-close,gpu-parity}.test.ts.txt
```

The golden test regenerates its inputs from seeds, so **any change to the world's random draws or rules invalidates the
golden file and every checkpoint** (that is what the start-roll change did). Re-export after such a change.

## What is where, outside git

- `scripts/train-vla/runs/*.pt` (30 MB, git-ignored): every PyTorch checkpoint of the second pass, copied here so they
  survive. `run-bc`, `run-dart`, `run-bc-cam`, `run-dagger` (scratch, 5 000 steps), `run-dagger-cam` (5 000),
  `run-dagger-cam-long` (12 000, the best), and the ten per-round fine-tunes.
- Datasets: `/private/tmp/claude-501/-Users-paul-jiang-Desktop-Paul/64f9f8ce-0232-46f5-ba37-e9b775e36cc6/scratchpad/vla-data2`
  (3.5 GB; first pass in `…/vla-data`, 2.6 GB, obsolete). A session scratchpad: assume it disappears. Expert data regrows
  from seeds in minutes; the DAgger rounds regrow only by running the rounds again (they depend on the models).

## Fragile or unfinished — the honest list

1. **Unequal training budgets** (see the end of RESULTS.md). The headline "DAgger 82.7 % vs BC 35.7 %" compares 5 000
   steps on more data with 4 000 steps; the 12 000-step model beat everything. Rerun BC / DART / DAgger at 12 000 before
   quoting any of these in the article.
2. **One seed, 300 episodes.** No error bars. The plan asks for 3 seeds. ±3 points is noise at this size.
3. **DART** was tried at σ = 0.15 (worse) and 0.05 (no effect). My explanation (its data never contains a missed grasp)
   is reasoning, not a measurement. Check it: count `missed` events and closed-and-empty steps per dataset.
4. **The grasp window and proprioception were changed to make BC work at all** (stage 0.2). Both are recorded in
   `params.ts` and RESULTS.md; the article has to say so.
5. **The draft page is a stopgap**: no three.js, the "bench" picture is the rasteriser at 384 px (the top of the arm is
   cut off by the frame), one figure, checkpoint fetched on click (1.9 MB each, f32 — int8 not tried), 78 ms a step on
   the CPU in a worker. The table on the page is the second pass and does not yet include dagger-cam-v2.
6. **WebGPU timing (206 ms a step) is a kernel replay on noise**, not a training run. Embeddings, cross-entropy and data
   feeding are not in it. With 12 000 steps now looking necessary, "ten minutes in the page" becomes about forty for the
   best recipe: the in-page training story needs rethinking (train BC in the page and ship the others? fewer tokens?).
   This is the decision I was about to raise with Paul.
7. `policy.ts` returns attention for four of the five action tokens (the first comes out of the prompt pass, which does
   not record it).
8. `@webgpu/types` was added as a devDependency (types only).
9. The branch has never been pushed; Paul was asked and had not answered.

## The city test (a69985e)

Yes: `tests/city/sim.test.ts › never routes through a building` timed out at 5 s under load on dev's own code (a
training run on the GPU plus the full suite; alone it passes). It made 640 000 `expect` calls. The commit counts and
asserts once. It belongs on dev.
