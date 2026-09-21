# head camera — measurements

A lab notebook, in order. The question Paul asked on 2026-09-21: how do robots like Figure's do coarse manipulation from
head-mounted vision alone, and is there an article in it that trains in the page in under five minutes? Working title:
「頭上一顆相機就夠了？自己訓練一個小的 Figure」.

Script: `spike.test.ts.txt` beside this file (its header has the command). Everything below ran in node on an M4 Pro,
with the site's own `lib/ml` (f64, JavaScript, one thread), so a training time here is what a reader's page would take.
Seeds fixed; 200 episodes a condition unless said; one training seed, so ±4 points is noise.

## What Figure says it does (their posts, read 2026-09-21)

- Helix (Feb 2025): inputs are "monocular robot images and robot state information (consisting of wrist pose and finger
  positions)". System 2, a 7B VLM at 7–9 Hz, hands one latent vector to System 1, an 80M transformer at 200 Hz that outputs
  a 35-DoF continuous action (wrists, fingers, torso **and head orientation**). "Standard regression loss", ~500 hours of
  teleoperation.
- Logistics update: stereo features merged before tokenising (+60 % throughput), multiscale features, and "visual
  proprioception": the 6D pose of the end effectors estimated "entirely from each robot's onboard visual input", for
  self-calibration across robots. "8 hours of well curated demonstration data can yield a dexterous and flexible policy."
- Figure 03: palm cameras, "redundant, close-range visual feedback during grasps" for "when the main cameras are
  occluded"; fingertips that feel 3 g. That is, head cameras alone were not enough for everything.

Sources: figure.ai/news/helix, /helix-logistics, /introducing-figure-03.

## The set-up

The № 010 arm (its kinematics and rasteriser, `renderBoxes`), one 4 cm block on the bench, the hand moving in a plane
5.5 cm above the bench. An action is a step of at most 2.5 cm in x and y. Success: within 3 cm of the block for three
steps running, inside 40. The camera is a head: 62 cm up, 22 cm to the side of the arm's base, looking down the bench;
32 × 32 pixels, so a pixel is 1–2 cm of bench.

Policies, all the same network unless said (conv 3→8, pool, conv 8→16, 8 spatial-softmax keypoints, dense 32, dense 2:
2 138 parameters):

| | sees | is told | says |
| --- | --- | --- | --- |
| open | one picture, arm parked | — | where the block is on the bench; a script then drives there by the joints |
| closed | every picture, arm in it | — | which way to move |
| blind | every picture, **arm not drawn** | where its hand is | which way to move |
| both | every picture, arm in it | where its hand is | which way to move |
| pairs | as closed, but the dense layers get only the gaps between keypoints (3 418 parameters) | — | which way to move |

Nobody trains with the camera moved unless it says "shaken". Then the camera is turned.

## Run 0 — the principle, with no learning (true pixel positions)

"look": back-project the block's pixel through the camera the robot believes it has, drive there. "servo": each step,
turn the pixel gap between hand and block into a move through the Jacobian of the camera it believes it has. Both
believe the camera is where it was. 300 episodes.

| | as calibrated | pitch 2° | 5° | 10° | 20° | yaw 2° | 5° | 10° | 20° | moved 3 cm | block moved at step 8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| look once | 100 | 12.3 | 0 | 0 | 0 | 100 | 0 | 0 | 0 | 44.0 | 82.7 |
| keep looking (servo) | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |

**The principle holds completely.** A position computed from one look is wrong by 8.8 cm at 5° of pitch. A hand that is
in the same picture as the block gets there with a camera 20° off and a Jacobian that is stale: the error it steers by
goes to zero exactly when the hand is on the block, whatever the camera thinks.

## Run 1 — first learned models (camera straight above the arm's base, hand 9 cm up, 2 500 steps = 46 s each)

| | as trained | pitch 5° | yaw 5° | block moved |
| --- | --- | --- | --- | --- |
| open | 92.5 | 38.5 | 15.5 | 73.0 |
| closed | 59.5 | 19.0 | 26.0 | 75.5 |
| blind | 95.5 | 34.5 | 3.0 | 98.5 |
| both | 33.0 | 23.0 | 30.5 | 46.5 |

Training is fast (870 samples/s, 3 s of the 46 drawing pictures). But "closed" cannot even do the job with the camera
untouched, while "blind" can: **it could not see its hand.** From straight above the base the forearm hides it, and it
is two pixels wide. My mistake in the set-up: a humanoid's arm hangs from a shoulder beside the head.

## Run 2 — the head beside the shoulder, a hand that can be seen, the hand just above the block (2 500 steps)

| | as trained | pitch 5° | 10° | yaw 5° | 10° | moved 3 cm | block moved |
| --- | --- | --- | --- | --- | --- | --- | --- |
| closed | 73.0 | 29.0 | 11.0 | 48.0 | 14.0 | 35.5 | 77.5 |
| blind | 98.5 | 51.5 | 50.0 | 15.5 | 5.0 | 62.5 | 100 |
| both | 82.0 | 13.5 | 7.0 | 10.5 | 0.5 | 47.0 | 89.5 |

Better, and still nothing like run 0. **A network that keeps looking is not thereby immune.** During training the
camera never moves, so "where the block is in the picture" and "how far the hand is from it in the picture" say the
same thing, and nothing makes the network prefer the second. It learned a mixture, and the absolute half breaks.

## Run 3a — twice the training (5 000 steps = 85 s), and a network that is only shown gaps

| | as trained | pitch 5° | 10° | 20° | yaw 5° | 10° | 20° | moved 3 cm | block moved |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| closed | 96.5 | 53.0 | 9.0 | 3.5 | 72.0 | 59.5 | 0 | 54.0 | 99.5 |
| pairs | 98.5 | 77.0 | 35.0 | 33.5 | 47.0 | 17.0 | 16.0 | 48.0 | 99.5 |

More training fixes the untouched camera (96.5 %). Hiding the absolute positions from the dense layers helps pitch and
hurts yaw: the keypoints are not "hand" and "block", they are whatever eight things were useful, and some of them sit
on the bench's edges, which move with the camera. An architecture alone did not buy the principle.

## Run 3b — the same, with the training camera shaken (±10°, ±3 cm, a different camera for every picture)

| | as trained | pitch 5° | 10° | 20° | yaw 5° | 10° | 20° | moved 3 cm | block moved |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| open, shaken | 78.5 | 84.5 | 80.0 | 21.0 | 82.0 | 81.0 | 24.5 | 82.0 | 60.5 |
| closed, shaken | 99.0 | 99.5 | 96.5 | 56.5 | 96.0 | 96.0 | 70.0 | 97.5 | 99.5 |
| pairs, shaken | 98.5 | 92.0 | 97.0 | 64.5 | 96.0 | 90.5 | 70.5 | 98.5 | 99.5 |

- **Keep looking + a shaken camera: 96–99.5 % everywhere inside the range it was shaken over, at no cost with the camera
  untouched (99.0 %), in 85 seconds of training in JavaScript.** Outside the range (20°) it still does 56–70 %.
- **Look once + the same shaking: it buys robustness (80–84 %) and pays for it with the camera untouched
  (92.5 % → 78.5 %)**, falls to 21–25 % at 20°, and cannot follow a block that moves (60.5 %). It has to work out where the
  camera is from the outline of the bench in one 32 × 32 picture, and then still compute a position.
- So the honest sentence is not "closed loop is immune" but: **the loop makes robustness cheap to learn.** With the hand
  in the picture, a shaken camera teaches the network to steer by the gap, and the gap is right whatever the camera
  does. Without it, the same shaking has to teach camera calibration from a glance.

## Run 4 — three training seeds, and what the keypoints follow (5 000 steps, 200 episodes; mean, min–max)

| | as trained | pitch 5° | 10° | 20° | yaw 5° | 10° | 20° | moved 3 cm | block moved |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| open | 79.3 (75.0–87.5) | 2.3 | 0.3 | 0.8 | 4.0 | 1.2 | 0.8 | 10.3 | 63.2 |
| closed | 87.0 (70.5–97.5) | 28.8 (10.0–48.0) | 17.2 | 4.5 | 37.0 (16.5–73.5) | 19.2 | 12.5 | 56.5 | 90.3 |
| open, shaken | 66.5 (65.5–68.0) | 69.5 (63.5–77.0) | 67.8 | 9.3 | 68.0 | 56.2 (27.5–74.0) | 17.3 | 65.5 | 55.8 |
| closed, shaken | 75.5 (**43.0**–92.0) | 75.3 (40.0–93.5) | 71.3 | 51.5 | 78.3 (47.5–96.5) | 72.2 | 41.3 | 72.8 | 80.7 (49.5–96.5) |

**Run 3b's 99 % was one lucky seed.** Same code, same data recipe, three initialisations: 92.0, 91.5 and 43.0 % with the
camera untouched. What survives three seeds:

- The ORDER survives everywhere. Look once with a fixed camera is dead at 5° (2.3 %). Shaking the camera makes both
  robust inside the range; keep-looking is ahead of look-once on every column, by a little inside the range (75 vs 69 at
  5° of pitch) and by a lot outside it (51.5 vs 9.3 at 20° of pitch, 41.3 vs 17.3 at 20° of yaw) and when the block moves
  (80.7 vs 55.8).
- The SIZE does not. "96–99.5 % at no cost" is not a finding; "about 75 %, with one seed in three failing to learn the
  job properly" is. Training this network for 5 000 steps is not reliable, and look-once pays for shaking too
  (79.3 → 66.5 untouched). The article cannot be written from these numbers; the training has to be made dependable
  first (more steps, a learning-rate schedule, a larger trunk, 48 × 48: all unmeasured).

What the keypoints follow (R² of a keypoint's position against the hand's pixel and against the block's, 300 random
scenes, camera as trained; seed 11; the full lists for every seed are in `run-4.log.txt`):

- closed, never shaken: one keypoint follows the hand (R² 0.77). **None follows the block** (best 0.38); four are a
  mixture of both (0.4 / 0.3).
- closed, shaken: **two follow the hand (0.85, 0.61) and three follow the block (0.86, 0.81, 0.60)**, each with R² ≤ 0.06
  on the other. Pictures with the keypoints drawn: `vla-work/keypoints-closed-shake-*.ppm`.

So run 3a's explanation holds, measured: with a camera that never moves the network does not bother to find the block
as a thing; shaking the camera is what makes it separate "my hand" from "the block", which is what steering by the gap
needs. That is the figure for "what it learned to look at".

## Run 5 — what makes training dependable (closed + shaken, seeds 11–15, 200 episodes; mean, min–max)

The spike gained three switches (`HC_LR`, `HC_AUX`, `HC_BATCH`; header of `spike.test.ts.txt`). "aux" adds a straight
line from the eight keypoints to where the hand and the block are in the picture this camera took, trained beside the
action with weight 1 and thrown away afterwards: a small version of Figure's "visual proprioception", and it uses what
the simulator already knows. "cosine" warms up over 5 % of the steps to 3e-3 and then falls to 1e-4. The baseline is
runs 1–4's schedule, and its seeds 11–13 reproduce run 4 to the decimal (91.5, 92.0, 43.0). Seconds are with twelve
models training at once; one alone is about a fifth faster (run 4: 91 s for 5 000 steps).

| | steps | s a model | as trained | pitch 5° | 10° | 20° | yaw 5° | 10° | 20° | moved 3 cm | block moved |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | 5 000 | 116 | 74.9 (43–92) | 74.7 | 71.0 | 51.3 | 77.5 | 74.0 | 39.7 | 76.3 | 82.9 |
| cosine | 5 000 | 116 | 64.3 (57–70) | 67.6 | 64.3 | 44.2 | 65.0 | 62.1 | 42.4 | 63.2 | 75.3 |
| aux | 5 000 | 111 | 81.2 (70–96) | 83.1 | 78.4 | 53.3 | 81.8 | 76.8 | 43.4 | 86.6 | 88.4 |
| aux + cosine | 5 000 | 113 | 73.2 (55–94) | 74.3 | 71.4 | 44.2 | 72.7 | 66.5 | 42.4 | 68.5 | 81.7 |
| **twice as long** | 10 000 | 208 | **91.3 (73–98)** | 92.5 (86–98) | 90.4 | 61.8 | 92.2 | 90.1 | 61.9 | 92.6 | 95.1 |

- **The network was under-trained, not badly initialised.** Every schedule that lowers the average learning rate
  (cosine) is worse; twice the steps lifts the mean by 16 points and the worst seed from 43 to 73. Per-seed logs:
  `run-5/`.
- aux helps a little at 5 000 steps (+6 mean, worst seed 43 → 70) and costs nothing in time.
- Seed 13 is still the weak one at 10 000 steps (73 %), and still has no keypoint that follows the block (best R² 0.45):
  the same failure as in run 4, only later.

## Run 6 — dependable training, and the three acts again at one budget (seeds 11–15, 200 episodes; mean, min–max)

Two fixes for closed + shaken on top of run 5's winner, and every other policy at the same 10 000 steps so the
comparison is fair (runs 1–4 compared them at 2 500–5 000). No aux except where it says so. Seconds as in run 5 (twelve at
once).

| | steps | s a model | as trained | pitch 5° | 10° | 20° | yaw 5° | 10° | 20° | moved 3 cm | block moved |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| open | 10 000 | 211 | 83.0 (78–92) | 3.5 | 0.6 | 0.9 | 3.5 | 0.5 | 0.1 | 5.3 | 65.7 |
| closed | 10 000 | 215 | 96.1 (90–98) | 41.6 (6–82) | 20.5 | 6.8 | 58.3 (26–85) | 32.1 | 6.8 | 60.0 | 98.7 |
| open, shaken | 10 000 | 210 | 75.7 (54–86) | 75.8 | 75.1 | 8.7 | 78.9 | 70.0 | 19.9 | 72.7 | 59.6 |
| closed, shaken (run 5) | 10 000 | 208 | 91.3 (73–98) | 92.5 | 90.4 | 61.8 | 92.2 | 90.1 | 61.9 | 92.6 | 95.1 |
| closed, shaken + aux | 10 000 | 216 | **95.0 (92–97)** | 95.2 (92–100) | 94.0 | 72.4 | 94.2 | 93.2 | 73.3 | 94.6 | 98.2 |
| closed, shaken | 15 000 | 313 | **98.1 (96–100)** | 96.5 (92–99) | 97.3 | 73.5 | 97.0 | 95.7 | 73.4 | 99.0 | 99.0 |

- **Training is dependable now, two ways.** 15 000 steps: every seed 96–99.5 % untouched and ≥ 92 % inside the shaken
  range. 10 000 steps + aux: every seed 92.5–97 %, in two thirds of the time. The spread that made run 4 unwritable
  (43–92) is gone.
- **The three acts hold at an equal budget, and the sizes are now five-seed sizes.** Look once dies at 5° (83 → 3.5 %).
  Keep looking without shaking is better but not immune (96 → 42 % at 5° of pitch, with seeds from 6 to 82). Shaking
  makes look-once flat inside the range (≈ 75 %) and pays for it untouched (83 → 76) and when the block moves (60 %);
  keep looking + shaking is ≥ 90 % everywhere inside the range, keeps 62–74 % at 20° where look-once has 9–20 %, and
  follows a moving block (95–99 %).
- **Correction to run 4's explanation.** At 15 000 steps, seeds 13 and 14 succeed (97 %, 99.5 %) with NO keypoint that
  follows the block on its own (best R² 0.53, 0.49): the block's position is spread over several keypoints. So "a
  keypoint that follows the block" is sufficient, not necessary. With aux every seed has one (best block R² 0.86–0.91),
  which is what a figure of "what it looks at" needs: aux makes the picture legible, not just the training steady.
- aux is a fairness question for the article: it has been given only to closed + shaken. Open + shaken + aux is
  unmeasured.

## Run 7 — a reader's seconds, and aux for look-once too

**One model alone** (nothing else running; seed 11; the success rates here are 50 episodes and are not used):

| | steps | seconds |
| --- | --- | --- |
| closed, shaken + aux | 10 000 | **174** |
| closed, shaken | 15 000 | **264** |
| open, shaken | 10 000 | **171** |

So the two models that carry the story, trained one after the other in the page, take about 5 ¾ minutes at 10 000 steps
(with aux on the closed one). The promise "under five minutes" does not hold for both; about three minutes a model does.

**Open + shaken + aux** (10 000 steps, seeds 11–15, 200 episodes), beside run 6's rows:

| | as trained | pitch 5° | 10° | 20° | yaw 5° | 10° | 20° | moved 3 cm | block moved |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| open, shaken | 75.7 (54–86) | 75.8 | 75.1 | 8.7 | 78.9 | 70.0 | 19.9 | 72.7 | 59.6 |
| open, shaken + aux | 79.4 (71–85) | 77.4 | 74.5 | 13.2 | 80.0 | 71.8 | 14.2 | 71.3 | 61.4 |
| closed, shaken + aux | 95.0 (92–97) | 95.2 | 94.0 | 72.4 | 94.2 | 93.2 | 73.3 | 94.6 | 98.2 |

- aux gives look-once a few points and a tighter spread, as it did keep-looking, and the gap between them is unchanged:
  14–21 points inside the range, 59 at 20° of pitch, 37 when the block moves. The comparison is fair with aux on both
  sides. Per-seed logs: `run-7/`.

## Run 8 — disturbances training never showed (aux recipes, 10 000 steps, seeds 11–15, 200 episodes)

`HC_MORE=1` adds six conditions to the evaluation. Shove: at step 8 the hand is knocked 6 cm in a random direction. Second
block: a yellow block of the same size elsewhere on the bench (≥ 8 cm from the red one). Noise: Gaussian, per channel, on
0…1 pixels. Light: every pixel × 0.7. The first eleven columns reproduce runs 6–7 to the decimal.

| | as trained | shoved 6 cm | second block | noise 0.05 | noise 0.15 | light 70 % | light 70 % + pitch 5° |
| --- | --- | --- | --- | --- | --- | --- | --- |
| open, shaken + aux | 79.4 (71–85) | 77.4 | 68.2 (39–82) | 26.0 (12–62) | 3.7 | 45.8 (20–82) | 49.5 |
| closed, shaken + aux | 95.0 (92–97) | **95.8 (95–96)** | 77.5 (58–96) | **50.7 (34–87)** | **8.6** | **64.5 (41–90)** | 62.9 |

- **A shove costs nothing** (95.8 %). It is the same fact as the moving block: a policy that looks every step does not
  care how the gap came about. (Look-once does not care either, for the opposite reason: it drives by its joints.)
- **Noise and light break both.** 0.05 of noise halves keep-looking; 30 % less light takes a third. Nothing in training
  ever varied the pixels' values, only the camera's pose, so the network is free to lean on exact colours. It is run 2's
  lesson again, one level down: **what training never varies, the network is allowed to depend on.**
- A second block of another colour costs 18 points and splits the seeds (58–96). Which block is meant is exactly what
  an instruction would say: the natural door to the "L" of VLA.

## Run 9 — vary the pixels in training too (`HC_PHOTO=1`: noise σ 0…0.1, light × 0.6…1.2, per picture)

Same models and evaluation as run 8, aux on, 10 000 steps, seeds 11–15. Run 8's numbers in brackets.

| | as trained | pitch 5° | pitch 20° | block moved | shoved | second block | noise 0.05 | noise 0.15 | light 70 % | light 70 % + pitch 5° |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| open, shaken + aux + photo | 64.8 [79.4] | 69.2 | 3.7 | 50.3 | 64.0 | 53.6 | 61.7 [26.0] | 34.1 [3.7] | 63.3 [45.8] | 64.1 |
| closed, shaken + aux + photo | 93.2 [95.0] | 92.0 | 57.3 [72.4] | 96.5 | 94.9 | 72.1 [77.5] | **95.6 [50.7]** | **60.5 [8.6]** | **90.0 [64.5]** | **86.5 [62.9]** |

- **Varying the pixels in training fixes what run 8 found.** Keep-looking: noise inside the trained range (0.05) costs
  nothing now (95.6 %), light at 70 % costs 5 points instead of 30, and noise three times beyond anything trained (0.15)
  still leaves 60 % instead of 9 %.
- It is not free: 2 points untouched, 15 at 20° of pitch (outside the shaken range), 5 on the second block. More to learn
  in the same 10 000 steps.
- Look-once pays much more: 15 points untouched (79.4 → 64.8). Every added nuisance widens the gap (now 28 points
  untouched). My reading, not measured: look-once must see through all of them from one picture, while keep-looking only has to find two
  things in the same picture.
- Recipe for the page, unless something beats it: closed + shaken + aux + photo, 10 000 steps.

## Run 10 — language: which block (red or yellow), and three ways to say it (10 000 steps, seeds 11–15, 200 episodes)

Script: `lang.test.ts.txt` (its header has the command). Two blocks, red and yellow, ≥ 8 cm apart; an instruction of one
word names one. Recipe as run 9 (keep looking, shaken, aux on hand + NAMED block, photo). "none" gets no instruction;
"late" joins an 8-number word vector to the keypoints before the dense layers; "film" makes the word set a scale and a
shift for each of the second convolution's 16 channels (the per-channel op is written in the script and checked against
finite differences; it is not in lib/ml). "wrong" = ended holding still on the other block. Fifteen models at once:
≈ 300 s each.

| | two blocks | only the named one | instruction switched at step 8 | named block moved | pitch 5° | yaw 10° | noise 0.05 | light 70 % |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| none | 15.9 (10–22), wrong 6.2 | 29.1 | 16.0 | 19.7 | 15.4 | 12.5 | 12.3 | 12.2 |
| late | 25.1 (14–45), wrong 3.8 | 30.0 | 30.5 | 27.4 | 26.3 | 24.2 | 24.3 | 20.4 |
| film | **47.1 (16–74)**, wrong 1.4 | 51.7 | 56.3 | 52.2 | 50.0 | 47.9 | 47.9 | 39.0 |

- **The order is clear, the sizes are not usable.** FiLM beats late fusion by 22 points and late beats nothing by 9; but
  FiLM's seeds run from 16 to 74, the same under-training signature as run 4.
- Failures are rarely the wrong block (FiLM 1.4 %): mostly neither block is reached.
- "none" is far below the 50 % a guess would give. Unmeasured guess: under MSE the best action with no instruction is the
  average of the two directions, which leads between the blocks. Worth measuring (where "none" episodes end) because it
  would be a clean paragraph.
- Even with only the named block on the bench, all three stay low (29–52 %), which suggests the task with two blocks in training is
  harder to learn, not just harder to evaluate.

## What this means for the article

0. **Read run 6 first.** Runs 1–4's sizes were one or three seeds at unequal budgets; run 6 has five seeds at one
   budget and dependable training. Point 2's timings are superseded: see run 6's seconds.
1. The thesis survives in a better form than I proposed. Three acts, all measured: look once breaks at 2–5°; keep
   looking is not enough on its own (run 2, 3a); keep looking + shake is (3b). The learning-free controller (run 0) is
   the explanation, and it is worth a figure of its own: it can be drawn.
2. Training in the page is real, for one model. **Decided with Paul 2026-09-21 (option A):** the reader trains only
   closed + shaken + aux (10 000 steps, 174 s in node, run 7); every other policy ships as a checkpoint trained with the
   same recipe, and the page says so.
3. Figure's "visual proprioception" and "head orientation in the action space" are both natural sections: the first is
   run 1's failure (it could not see its hand), the second is the next experiment.

## Not done, and what I do not trust yet

- Runs 1–3b are one training seed per cell and run 4 three; trust runs 5–6 (five seeds) over them.
- Page seconds are measured in node (run 7), not yet in a browser tab.
- No disturbance of the arm (a shove), no noise on the picture, no distractor objects, no second block colour. The
  "language" of a VLA is absent: one task, no instruction.
- The hand moves in a plane. No grasp, no descent, no gripper.
- 32 × 32 only. Whether 48 × 48 buys the last few points, and what it costs in seconds, is unmeasured.
- The keypoints have been measured (run 4) but not yet looked at as pictures under a turned camera.
