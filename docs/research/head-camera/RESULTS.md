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

## Run 11 — language at 20 000 steps (late and film, seeds 11–15)

| | two blocks | only the named one | instruction switched | named block moved | pitch 5° | yaw 10° | noise 0.05 | light 70 % |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| late | 46.6 (21–82), wrong 3.5 | 52.8 | 57.9 | 52.0 | 47.4 | 42.9 | 48.7 | 39.2 |
| film | **74.7 (56–85)**, wrong 0.0 | 78.9 | 82.2 | 80.0 | 72.6 | 72.8 | 78.0 | 67.9 |

- Twice the steps: FiLM 47 → 75 %, late 25 → 47 %. Both still rising, so still under-trained; FiLM's lead holds (28 points)
  and its spread narrows (16–74 → 56–85).
- **FiLM almost never goes to the wrong block**: 0.0 % with two blocks, at most 0.4 % in any column.
  What it fails at is reaching, not choosing.
- Switching the instruction halfway is not harder than keeping it (82 vs 75): the policy is re-asked every step.
- At ≈ 300 s for 10 000 steps with 15 at once, 20 000 steps is far outside a page's budget. Language ships as a
  checkpoint in any case (option A).

## The 3D prototype (2026-09-21) and one thing it showed

`content/posts/head-camera/` (draft № 013): a three.js bench where the reader drags the block, turns the head camera, and
switches between two checkpoints saved by the script (`HC_SAVE`; run 9's recipe with aux, seed 11, the best of five for
both: 98.5 % and 75.5 % untouched). `tests/head-camera/model.test.ts` checks the page's model module against the script's
golden outputs to 1e-9.

Watching it showed something no run measured: every episode stopped at the first arrival, so **staying** was never
scored. Measured afterwards (closed, seed 11, 100 random blocks, 40 more steps after arriving): within 3 cm for 95.9 % of
those steps; the largest drift has a median of 2.6 cm and a 90th percentile of 3.5 cm. From one place, [0.30, −0.16],
the forearm hides the block from the head camera and the hand wobbles 3–4 cm off: the prototype starts elsewhere.

## Run 12 — pick and place, first attempt: nothing learns (2026-09-21)

Paul asked whether the reaching article is interesting enough; my answer was that the mechanism is but the task is
thin, and that picking a block up and putting it on a pad would make "a small Figure" honest. Script: `pick.test.ts.txt`
(the first version is `run-12/pick-v1.test.ts.txt`). World: the reaching spike's head camera, a red block and a green
7 cm pad ≥ 12 cm apart, a hand with height and two jaws; closing within 1.5 cm of the block and low picks it up, opening
puts it down; success = released within 3 cm of the pad, inside 90 steps. The teacher (rise, travel, descend, close;
rise, travel, descend, open) succeeds 100 % in every condition, 27 steps on average. Training samples are states drawn
all over the task, labelled by the teacher. keep-looking reads the picture plus the hand's height and the gripper
(Helix reads wrist pose and finger positions) but NOT the hand's x–y, which run 2 showed is a shortcut that breaks.

10 000 steps, 3 seeds, 200 episodes:

- open + shaken (one picture, then the teacher with perfect joints): 13.5–17.5 % untouched, grasping in 22–27 % of
  episodes. A position read from one 32 × 32 picture is not good to 1.5 cm.
- closed, shaken or not: **0 % in every seed and every condition, not one grasp.** Losses 0.08–0.15.

A step-by-step trace showed why: the hand never heads for the block (the teacher says dx = −1, the net says ≈ 0) and
hangs in the air. The teacher gated travel on height ("rise first, then move"), so most samples' x–y labels were zero
and the right one depended on height times direction: too much for this network. Run 13 replaces it with a funnel.

## Runs 13–15 — pick and place: three reasons it did not learn, then it does (20 000 steps, 2 seeds, 100 episodes)

Each run printed one episode step by step (`HP_TRACE=1`) and the error per output (`HP_DIAG=1`); the traces, not the
success rates, said what was wrong.

- **Run 13, a funnel teacher** (head for the goal always; hold a height that falls from 10 cm to 3.5 cm over the last
  4 cm). Directions became 61–89 % right, **success still 0 %** in every variant (32 px, 48 px, fetch only, told the
  hand's x–y, height following the teacher). Trace: the hand gets over the block (0.1–1 cm) and hovers at 5.5 cm. The
  funnel came to a point, so 0.5 cm of sideways jitter moved the target height 0.8 cm; and "grip" was under 1 % of samples,
  so its output never passed 0.1.
- **Run 14, a flat-bottomed funnel (LOW within 1.5 cm) and a fifth of samples in the grip region.** Now it descends to
  3.4–4 cm, and stalls 1.3–2.3 cm from the block, mostly in depth; grip output 0.2–0.3. 0–2 %. **Once the hand is low over
  the block it hides the block from the head camera**: the last two centimetres cannot be seen. This is the reason
  Figure 03 gives for its palm cameras ("when the main cameras are occluded").
- **Run 15, grasp within 3 cm** (a self-centring gripper; the reaching task's own tolerance):

| | as trained | pitch 5° | pitch 10° | pitch 20° | yaw 10° | block moved early |
| --- | --- | --- | --- | --- | --- | --- |
| closed, 32 px (seeds 11 / 12) | 89 / 69 | 0 / 0 | 0 / 0 | 0 / 0 | 6 / 0 | 92 / 72 |
| closed, 48 px | 100 / 93 | 31 / 34 | 0 / 0 | 0 / 0 | 6 / 1 | 99 / 87 |
| closed + shaken + photo, 32 px | 63 / 35 | 60 / 38 | 63 / 37 | 24 / 0 | 72 / 32 | 57 / 41 |

  The reaching article's second and third acts again, sharper: never shaken, a tilt of 5° takes it from 89 % to 0 %;
  shaken, it is flat across the range. But the shaken level is low and the seeds far apart: under-trained, as reaching
  was at 5 000 steps. 20 000 steps cost 479 s (32 px) and 870 s (48 px) with six at once: outside a page's budget, so
  pick and place would ship as checkpoints. Look-once + shaken was 13.5–17.5 % in run 12 (1.5 cm grasp); not rerun at 3 cm.

## Run 16 — shaken pick and place made dependable: 48 px (2 seeds, 100 episodes)

| closed + shaken + photo | as trained | pitch 5° | pitch 10° | pitch 20° | yaw 10° | block moved early | pad moved while carrying | shoved 5 cm |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 32 px, 40 000 steps (seeds 11 / 12) | 67 / 69 | 67 / 64 | 69 / 62 | 10 / 1 | 72 / 54 | 62 / 59 | | |
| **48 px, 20 000 steps** | **92 / 91** | 94 / 90 | 93 / 93 | 38 / 60 | 87 / 94 | 95 / 94 | void (see below) | 96 / 93 |

- **It works at 48 × 48**: about 92 % and flat across the shaken range, follows a moved block, shrugs off a shove.
  ("Pad moved while carrying" is VOID in runs 12–17: a bug moved the pad in the first episode only. Fixed in the script;
  to be measured from the saved weights.) Beside run 15's never-shaken 48 px model (100 / 93 untouched, 31 / 34 at 5°, 0 at 10°) this is the reaching
  article's thesis on a task worth the title.
- More steps at 32 px steadies the seeds (63 / 35 → 67 / 69) but does not lift the ceiling: resolution, not training, was
  the limit. A pixel at 32 px is 1–2 cm of bench, and the job needs 3 cm twice (grasp and place).
- Cost: ≈ 820 s for 20 000 steps at 48 px (four models at once), so this ships as checkpoints; the reader can still train
  the reaching model in the page.
- Two seeds only. Owed before prose: five seeds, look-once at 48 px with the 3 cm grasp (for the first act), the
  never-shaken row's remaining columns, and how long a single model takes alone.

## Run 17 — pick and place over five seeds: the shape holds in every seed, the training does not (48 px, 200 episodes)

closed at 20 000 steps, open at 10 000; mean (min–max). "Pad moved while carrying" is void here too (the bug was fixed
after these jobs had loaded the script). Weights saved for every seed in `vla-work/run17/`; the page ships seed 11's.

| | as trained | pitch 5° | pitch 10° | pitch 20° | yaw 10° | block moved early | shoved 5 cm |
| --- | --- | --- | --- | --- | --- | --- | --- |
| open | 60.0 (54–64) | 0 | 0 | 0 | 0 | 16.1 | 61.5 |
| open + shaken | 47.1 (16–58) | 45.5 | 47.2 | 0.1 | 40.6 | 14.1 | 46.4 |
| closed | 71.1 (**12**–100) | 14.5 (0–37) | 0.1 | 0.1 | 1.7 | 68.1 | 72.1 |
| closed + shaken | 54.0 (**2**–94) | 55.8 | 55.2 | 23.9 | 53.9 | 52.1 | 57.5 |

Per seed, as trained (11…15): closed 100 / 92.5 / 12 / 64 / 87; closed + shaken 93.5 / 92 / 2.5 / 31.5 / 50.5.

- Inside every seed the three acts hold: never shaken collapses with tilt, shaken is flat across the range, look-once
  cannot follow a moved block (14–16 %) and keep-looking can.
- **Run 16's 92 / 91 were seeds 11 and 12, the two good ones.** Seed 13 fails in both closed recipes (same seed = same
  initial weights), 14 and 15 are slow. Their losses are still falling at 20 000 steps (0.25, 0.20, 0.17 against 0.11 for
  seed 11): slow, not stuck. Run 18 gives them 40 000.
- Look-once tops out near 60 % even untouched: two positions read from one 48 × 48 picture, each needed to 3 cm.

## The blind strip (found by Paul in the page, 2026-09-21)

Paul reported that a block at the edges of the area is never grasped. Measured with the shipped checkpoints (seed 11), 6
random pads per block position on an 8 × 8 grid: everywhere 6/6 except the edge **away from the head camera**
(y = −0.22: 0–2 of 6 at most x; −0.16 only at the corners). The mirror edge (y = +0.22) is 6/6. A trace explains it: going
to (0.26, −0.22) the block's red pixels are gone by step 6, with the hand still 8 cm off, because the hand and forearm
come in from the camera's side and stand between camera and block; the network has no memory and wanders. Going to
(0.26, +0.22) the hand arrives from behind the block and grasps at step 12. The whole edge is inside the frame at every
shake, so it is not cropping. The page tints the strip (y < −0.17) and says so when the block is in it. One head camera,
one arm on its far side: this is what stereo and palm cameras are for.

## The arm's shadow, mapped, and the page's block area (2026-09-21)

Paul asked for all of it measured and the placements restricted. `maps/*.json`: the shipped shaken checkpoint (seed 11),
a 2 cm grid over AREA, 5 tries a cell with the other object at random; by block position and by pad position, untouched
and at 10° of pitch.

- **Block**: the shadow is an L, not a strip. Along the side away from the camera it is wide at both ends (to y = −0.12 at
  x ≥ 0.42 and at x ≤ 0.24) and one cell deep in the middle (x 0.30–0.38); the row nearest the base (x = 0.22) is weak up to
  y = −0.08. The map at 10° is the same.
- **Pad**: fine everywhere. Its scattered misses are episodes whose random block fell in the shadow.
- The page lets the block go only in **x 0.24–0.50, y −0.10–+0.22** (`BLOCK_AREA`; every cell 4–5 of 5) and tints the rest;
  the pad may go anywhere. Success over 200 of the page's own layouts (seed 99), untouched / pitch 10°:
  keep-looking + shaken **100 / 99.5 %**, keep-looking 100 / 0 %, look-once 71.5 / 0 %. These are one checkpoint each
  (seed 11), not the five-seed means above.

## Runs 18–19 — the weak seeds are slow, not stuck; every checkpoint on the page's own layouts

Run 18: closed + shaken seeds 13 / 14 / 15 at 40 000 steps instead of 20 000 (full AREA, 200 episodes): as trained
2.5 → 53.5, 31.5 → 82, 50.5 → 76.5; flat across tilt as ever. Losses 0.19 / 0.15 / 0.15 and still falling.

Run 19 (`run-19/`, script beside the results): all 23 saved checkpoints re-measured with the page's port on the page's
layouts (block inside BLOCK_AREA, pad anywhere), 200 episodes, seed 99, and with "pad moved while carrying" working.
Mean (min–max) over seeds 11–15:

| | as trained | pitch 5° | pitch 10° | pitch 20° | yaw 10° | block moved | pad moved |
| --- | --- | --- | --- | --- | --- | --- | --- |
| open, 10 000 | 66.3 (52–74) | 0 | 0 | 0 | 0 | 19.4 | 12.7 |
| open + shaken, 10 000 | 51.7 (24–62) | 51.4 | 53.1 | 0.2 | 45.7 | 16.8 | 10.2 |
| closed, 20 000 | 74.1 (15–100) | 14.5 (0–39) | 0 | 0 | 1.1 | 73.9 | 73.5 |
| closed + shaken, 20 000 | 59.0 (2–100) | 59.5 | 57.2 | 26.3 | 59.8 | 59.8 | 59.5 |
| closed + shaken, 40 000 (seeds 13–15 only) | 76.3 (54–88) | 78.7 | 76.0 | 32.3 | 74.2 | 73.5 | 76.2 |

Per seed, closed + shaken at 20 000, as trained: 100 / 97 / 2.5 / 36.5 / 59. Seeds 11 and 12 are done at 20 000 steps
(97–100 % everywhere inside the range); 13–15 need far more. The shape of the claim holds in every seed; its size depends
on the seed until training is made dependable. Run 20 trains all five for 60 000 steps.

## The block area's far corner, cut (2026-09-21, after Paul still found misses "too far out, where it is hidden")

The 5-tries map was too coarse. `maps/boundary-*.json`: y from −0.22 to 0.00 at every x, 20 tries a cell. For 19–20 of 20 the
limit is y ≥ −0.16 in the middle (x 0.28–0.40), −0.12 at x 0.42–0.48, **−0.06 at x 0.50**, and −0.04 at x 0.22. The rectangle's
far corner (x ≥ 0.46, y −0.10…−0.06) was 14–18 of 20, all of them failures to grasp. `blockFloor(x)` now lifts the lower limit
from −0.10 at x = 0.44 to −0.05 at x = 0.50. Over 600 random page layouts (seed 7): 600/600 untouched, 596/600 at 10° of
pitch. The tint is gone (Paul: no need to draw the forbidden part); the dashed outline shows the allowed area.

## Runs 20–21 — pick and place made dependable: 60 000 steps (closed + shaken, 48 px, seeds 11–15)

Run 20, the script's own evaluation over the full AREA (shadow included), as trained: 97.5 / 97.5 / 77 / 87.5 / 80.5
(at 20 000 steps: 93.5 / 92 / 2.5 / 31.5 / 50.5). Losses 0.09–0.16. Run 21, the same five checkpoints on the page's
layouts (block inside the cut BLOCK_AREA), 200 episodes, seed 99; mean (min–max):

| as trained | pitch 5° | pitch 10° | pitch 20° | yaw 10° | block moved | pad moved |
| --- | --- | --- | --- | --- | --- | --- |
| **94.8 (92–100)** | 94.3 (88–100) | 93.2 (84–100) | 43.2 (17–60) | 92.4 (86–100) | 95.4 (90–100) | 95.8 (93–100) |

Every seed is above 92 % untouched and above 84 % anywhere inside the shaken range: the seeds were slow, not broken, and
the recipe is dependable at three times the steps. Cost: about 40 minutes a model with five at once. Two things are
owed before the article's table can use this row: the other rows re-measured on the same (cut) layouts, which run 19
predates (run 22), and keep-looking without shaking at the same 60 000 steps (run 23).

## Run 22 — the other rows on the cut layouts; the page now ships the 60 000-step checkpoint

Run 19 predates the cut corner of BLOCK_AREA, so its 20 checkpoints were measured again on the current layouts
(`run-22/`): open 65.8 / 0 / 0 / block moved 17.7 / pad moved 11.7; open + shaken 51.4 / 53.0 (pitch 10°) / 45.6 (yaw 10°) /
15.5 / 10.5; closed 74.4 (16–100) / 0 / 1.1 / 73.2 / 74.1; closed + shaken at 20 000 steps 59.0 (2–100). The article's table
uses these three rows and run 21's 60 000-step row, and says the budgets differ. `pick-shaken.json` is now run 20's
seed 11 (60 000 steps): on 200 page layouts 100 % untouched, 99.5 % at 10° of pitch, 100 / 100 / 97 % at 80 / 70 / 50 % light,
96.5 % and 44.5 % at noise 0.05 and 0.15.

## Runs 23–24 — keep-looking WITHOUT shaking at the same 60 000 steps: an equal-budget comparison

Run 23 (full AREA, 200 episodes), as trained per seed: 99.5 / 96.5 / 71.5 / 96 / 100; at 10° of pitch 0–1.5 % in every
seed. Run 24, the same checkpoints on the page's layouts, mean (min–max):

| | as trained | pitch 5° | pitch 10° | yaw 10° | block moved | pad moved |
| --- | --- | --- | --- | --- | --- | --- |
| closed, 60 000 | 95.5 (81–100) | 28.2 (0–52) | 0.7 | 9.0 (0–34) | 94.2 | 95.8 |
| closed + shaken, 60 000 (run 21) | 94.8 (92–100) | 94.3 | 93.2 | 92.4 | 95.4 | 95.8 |

Equal budgets, equal skill with the camera untouched, and 1 % against 93 % at 10°. The article's table now uses this row,
and `pick-fixed.json` is run 23's seed 11 (on 200 page layouts: 99.5 % untouched, 51 % at 5°, 1 % at 10°; 79 / 34 / 0 % at
80 / 70 / 50 % light; 0 % at noise 0.05). Look-once stays at 10 000 steps: it sees one picture an episode.

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

## Run 25 — the light-and-noise table again, and where two of the article's numbers came from (2026-09-22)

`run-25/`: the three shipped checkpoints on the current (cut) layouts. Light columns identical to the article's table,
look-once included; the noise columns vary between draws (Math.random) and the article's single draws are low. Also
recorded now, from the feat/vla session: fig. 03 trained in headless Chromium on the M4 Pro took 191.7 s wall (its
readout said 190 s; 90 % untouched) and a second full run 200 s (84 %); the line "Page seconds are measured in node,
not yet in a browser tab" below is out of date. The article's "88 % to 98.5 %" is run 9's five seeds (98.5 / 91.0 /
88.0 / 96.0 / 92.5), trained by the research script in Node, which trains identically to the page
(`tests/head-camera/trainer.test.ts`).
