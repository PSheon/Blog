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

## What this means for the article

1. The thesis survives in a better form than I proposed. Three acts, all measured: look once breaks at 2–5°; keep
   looking is not enough on its own (run 2, 3a); keep looking + shake is (3b). The learning-free controller (run 0) is
   the explanation, and it is worth a figure of its own: it can be drawn.
2. Training in the page is real: 85 s per model on one JavaScript thread, no WebGPU. Four models ≈ 6 minutes; the two that
   carry the story (open, closed-shaken) ≈ 3.
3. Figure's "visual proprioception" and "head orientation in the action space" are both natural sections: the first is
   run 1's failure (it could not see its hand), the second is the next experiment.

## Not done, and what I do not trust yet

- One training seed per cell. Rerun the 3b table with three seeds before any number goes into prose.
- No disturbance of the arm (a shove), no noise on the picture, no distractor objects, no second block colour. The
  "language" of a VLA is absent: one task, no instruction.
- The hand moves in a plane. No grasp, no descent, no gripper.
- 32 × 32 only. Whether 48 × 48 buys the last few points, and what it costs in seconds, is unmeasured.
- The keypoints have not been looked at. If they land on the hand and the block after shaking and on the bench's edges
  before, that is the figure for "what it learned to look at"; if they do not, run 3a's explanation is wrong.
