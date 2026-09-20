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
