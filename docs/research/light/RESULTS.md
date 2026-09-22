# light — measurements

A lab notebook, in order, for the path-tracing series ("光是怎麼被算出來的", four articles). The plan and the research
that came before any code are beside this file; they were written by another session (paul-b1) and handed over on
2026-09-21, with its spikes and the Sketchbook assets in `Desktop/Paul/light-work/` (outside the repo: `world.glb` still
carries Textures.com images that may not be redistributed).

Engine: `lib/rt/` (pure TypeScript + WGSL, tests in `tests/rt/`). Article 1: `content/posts/light-from-noise` (draft).

## 2026-09-21 — the engine and figure 1, first playable page

Machine: M4 Pro, Playwright's Chrome (adapter `metal-3`), 512 × 512, one path per pixel per sample, Lambert only, no
next-event estimation, Russian roulette after the third bounce. Every number below was read off the figure in the page.

| triangles | BVH build (in a worker) | nodes visited per ray | rays per second, in the page |
| --- | --- | --- | --- |
| 876 | 4 ms | 11.7 | 205–212 million |
| 998 796 | 920 ms | 16.4 | 133 million |

- More than a thousand times the triangles, 1.4 times the nodes per ray. The spike measured 11.8 → 16.5 with its own
  builder and kernel; two independent implementations agree.
- "In the page" means with a 10 ms GPU budget per frame and the frame loop waiting on `requestAnimationFrame`; the spike's
  401 million rays per second was a tight loop with nothing else to do. Both are true; the article quotes the page's.
- Builder (node, `tests/rt` timing probe): 9 ms / 146 ms / 1 325 ms for 876 / 101 412 / 998 796 triangles, depth 12 / 20 /
  23. Typed arrays and one sweep from each side per axis; the spike's took 2.5 s for a million.

### The error curve, and a metric that was wrong first

The figure plots the picture's error against the sample count with no reference image: even samples accumulate in one
buffer and odd ones in another, and half their difference is the error of their average.

- First version, measured in displayed (tone-mapped, clamped) values: **the curve rose before it fell.** At two samples
  most pixels are black in both pictures and agree by accident, and the clamp hides every bright hit.
- In linear radiance, relative to the picture's mean: the measured points lie on the −½ guide from 2 samples to 2 000
  (6.8 % at 2 009 samples for the 876-triangle scene). `tests/rt` checks the same law on the CPU tracer: the standard
  error at 16 samples over that at 256 is between 2.5 and 6.5 (√16 = 4).

### Two smaller things the page taught

- A GPU this fast is past the snow before anyone sees it. The sample count is allowed to double every 450 ms at first
  (1, 2, 4, 8 …) and runs flat out once that is faster than the hardware: 8 samples at 1.2 s, about 900 at 7 s.
- The ray and node counters are u32 and the node counter wraps every couple of seconds at these speeds ("0.7 nodes per
  ray" on the first try). Read four times a second, a difference modulo 2³² is always the true one.

### Not done

- No CPU-against-GPU pixel test yet (the plan's 32 × 32, 64 spp). CI has no adapter: the E2E test annotates
  "NO WEBGPU ADAPTER" and checks only the fallback message.
- Not looked at on a phone, in Safari, in Firefox, or on any GPU but this one. No fallback picture for readers without
  WebGPU, only a sentence.
- Figures 2–4 (one ray bounce by bounce on the CPU, bounce limit side by side, the BVH heat map), the prose, en.mdx,
  the cover, the series field.

## 2026-09-21 — figure 4 (BvhLab), in the page

M4 Pro, Chrome (adapter metal-3), 256², camera rays only (heat mode stops at the first hit). Each row is one exact
64-sample burst: counters are zeroed, the burst runs alone, and the u32 counters cannot wrap inside it.

| Triangles | BVH | Node visits or triangle tests per ray | M rays/s |
| --- | --- | --- | --- |
| 876 | on | 9.5 | 112 |
| 9,612 | on | 10.4 | 170 |
| 101,412 | on | 11.4 | 158 |
| 998,796 | on | 11.9 | 141 |
| 876 | off | 876 | 45 |
| 9,612 | off | 9,612 | 5.4 |

1,140× the triangles cost 1.25× the visits. With the BVH off the switch is locked above 10,000 triangles: one sample
would run long enough for the browser to kill the GPU task. The 876-triangle row is slower than the 9,612 one because
at that size the burst is too short for the GPU to reach its clock; do not quote it as a trend.

## 2026-09-21 — figure 2 (PathLab), CPU paths against the GPU's pixel

Paths are traced on the main thread by `lib/rt/cpu.ts` with `streamFor(pixel, n)`, so a pixel's paths are the same on
every visit. Pixel (40, 256) on the red wall: mean of 101 paths tone-maps to rgb(195, 38, 36); the GPU's 1,024-sample
pixel is rgb(163, 31, 29). Pixel (196, 430) on the floor: 201 paths rgb(194, 183, 183) against rgb(183, 168, 168).
About 3–7% of paths reach the light (no next-event estimation yet: that is article 2).

## 2026-09-21 — CPU against GPU, eight pixels

Through figure 2 itself (en page, 1440 px, M4 Pro, Chrome metal-3): click a pixel, press "Shoot 100" twenty times (2,001
CPU paths, `streamFor(pixel, n)`), read the swatches. The GPU pixel has 1,024 samples. Values are tone-mapped sRGB.

| Pixel (fraction of the picture) | CPU, 2,001 paths | GPU, 1,024 samples |
| --- | --- | --- |
| red wall (0.08, 0.50) | 162, 30, 28 | 158, 29, 28 |
| green wall (0.92, 0.50) | 77, 162, 86 | 87, 174, 97 |
| floor (0.50, 0.93) | 118, 105, 98 | 127, 111, 103 |
| ceiling (0.50, 0.06) | 128, 115, 100 | 134, 116, 105 |
| back wall (0.50, 0.30) | 213, 210, 207 | 213, 210, 206 |
| floor, left (0.38, 0.84) | 166, 148, 137 | 170, 146, 136 |
| torus (0.30, 0.62) | 174, 158, 154 | 176, 167, 159 |
| lamp (0.50, 0.115) | 255, 255, 255 | 255, 255, 255 |

Largest gap 12 levels (green wall, G). Both sides are still noisy at these counts; the gaps go both ways. This is a
spot check by hand, not a test: CI has no GPU adapter, so it cannot be automated there.

## 2026-09-21 — the playground, in the page

960×540, 24,545 triangles, M4 Pro: full path tracing (8 bounces, sun by NEE) 3.3 ms per sample; raster view 0.7 ms.
While W is held the accumulation stays at single-digit samples (7 seen).

## 2026-09-21 — article 2: sampling strategies (M4 Pro, Chrome metal-3, 512², in the page)

Strategies: 0 uniform hemisphere, 1 cosine, 2 cosine + next-event estimation, 3 MIS (power heuristic).

**Cornell box with tori (article 1's room), four tiles from the same samples, at 719 spp:** tile error 16% / 12% / 2.9% /
3.0%; one sample worth 0.6 / 1 / 16 / 15 of cosine's; tile mean radiance 0.405 / 0.406 / 0.405 / 0.406 (they must
agree, and do). At 103 spp: 45% / 34% / 8.6% / 9.1%.

**Cost, each strategy alone, 256-sample bursts through `window.__light` (two rounds, second shown):**

| Room | Strategy | ms per sample | rays per pixel per sample | picture error at 256 spp |
| --- | --- | --- | --- | --- |
| tori | uniform | 2.72 | 4.29 | 23.8% |
| tori | cosine | 2.90 | 4.21 | 17.7% |
| tori | + ask the lamp | 5.71 | 7.00 | 3.32% |
| tori | MIS | 5.80 | 7.00 | 3.32% |
| three balls, medium lamp | uniform | 4.55 | 4.50 | 23.7% |
| three balls | cosine | 4.83 | 4.44 | 18.0% |
| three balls | + ask the lamp | 7.68 | 7.08 | 6.86% |
| three balls | MIS | 7.63 | 7.08 | 5.96% |

Tori room: asking the lamp costs 1.97× the time of a cosine sample and cuts the error 5.3×, i.e. 28× the samples'
worth, 14× per unit of time (whole-picture metric; the four-tile figure says 15–16× per sample because each tile is
measured against its own mean).

**Three balls, four tiles, ~500 spp (277 for the first row), tile errors uniform / cosine / ask / MIS:**

| Lamp half-side | Middle ball roughness | uniform | cosine | ask the lamp | MIS |
| --- | --- | --- | --- | --- | --- |
| 0.06 | 0.08 | 140% | 114% | 138% | 55% |
| 0.06 | 0.7 | 100% | 82% | 54% | 37% |
| 0.7 | 0.08 | 6.9% | 5.3% | 48% | 2.3% |
| 0.7 | 0.7 | 6.9% | 5.4% | 2.5% | 2.2% |

Tile means agree within noise in every row (0.41–0.42). With the small lamp the errors stay huge for every strategy:
the light that reaches the floor through the glass ball is found by luck only (a shadow ray towards the lamp is
blocked by the glass). With the large lamp and a smooth ball, asking the lamp alone is nine times WORSE than not
asking: the lamp almost touches the walls, and a point next to it divides by a tiny squared distance.

**White furnace (lamp off, white 1 outside, every albedo 1, 64 bounces, ~600 spp), green channel, mean of 6 pixels:**
smooth metal (roughness 0.02): everything 0.997–1.000. Roughness 0.3: 0.976–0.993. Glass: 0.996–1.000. Roughness 1:
the ball 0.29–0.32, and the room around it darkens to 0.76–0.86. Brute-force integration of the same formulas gives
0.988 / 0.824 / 0.307 for α = 0.09 / 0.36 / 1, as does lib/rt/ggx.ts. The furnace found a real bug on its first run:
next-event estimation was still asking the (switched off) lamp, and walls read 2.06.

## 2026-09-21 — the playground with a character and vehicles: where the time goes

M4 Pro, Chrome metal-3, 960×540, full path tracing (8 bounces, sun by NEE), camera at the player's spawn looking over
the car park: 5 cars, a helicopter, an aeroplane and the character = 11,275 moving triangles. Four bursts of 16
samples each (NOT 64: 64 × 518,400 pixels × 3 rays × 60 visits overflows the u32 counters, and my first round of
numbers here was garbage for exactly that reason). `.playwright-mcp/measure.js`, through `window.__lights`.

| Static world's long triangles | ms per sample, with vehicles | node visits per ray | ms per sample, world only | node visits per ray |
| --- | --- | --- | --- | --- |
| as in the file (some are > 100 m) | 9.24 | 60.8 | 6.24 | 55.3 |
| cut until no edge > 12 m | 6.84 | 36.6 | 4.22 | 31.1 |
| cut until no edge > 6 m | 7.07 | 37.2 | 4.39 | 31.7 |
| cut until no edge > 3 m | 7.78 | 41.9 | 4.98 | 36.5 |

The slowdown I had blamed on the vehicles was mostly the ground: a box around a 100 m triangle holds half the
playground. Cutting long triangles (lib/rt/playground.ts, MAX_EDGE = 12) takes a quarter off. Cutting finer makes the
tree deeper and loses again.

What did NOT help the moving tree (visits per ray unchanged within 0.5): splitting whole objects before triangles;
preparing each object's tree once with the surface area heuristic and refitting it per frame. The second one is kept
anyway because it halves the CPU cost per frame: 2.8 ms → 1.2 ms for 11,275 triangles. The vehicles still cost
2.6 ms per sample for 5.5 more visits per ray; not understood yet (the second traversal's fixed cost per ray, and
paths that rattle around inside a car's metal shell, are the suspects).

## 2026-09-21 — carrying the picture across a movement (temporal reprojection)

Same machine and view; the character strafes (D held), 12 consecutive frames read back from the canvas while moving.
Noise number: mean absolute difference between horizontally neighbouring pixels, 8-bit sRGB, every second pixel
(it includes real edges, so the true reduction is larger than the ratio). Frame rate while moving: 121 fps, one sample
per frame, both ways.

| History cap (samples a carried pixel may count for) | run 1 | run 2 |
| --- | --- | --- |
| 0 (start from nothing every frame, as before) | 6.81 | 7.44 |
| 12 | 3.04 | 2.85 |

First attempt validated history by distance alone (3 cm + 1% of depth) and did nothing for the ground: two jittered
rays through one pixel land decimetres apart on a floor seen at a shallow angle. Same triangle + a loose distance is
the test that holds. Known artefacts: the character itself gets no history (its triangles move, so every frame is its
first) and its shadow trails for a fraction of a second.

## 2026-09-21 — borrowing from neighbours (edge-stopping à-trous, three passes, steps 1 / 2 / 4)

Same walk (D held), same noise number as above (mean absolute difference between neighbouring pixels, 12 frames read
back while moving, foreground tab of the MCP browser): denoise off 3.11, on 1.33 (history cap 12 both). Against 6.8–7.4
with neither. Frame rate the same either way (85 and 88 while the measuring loop itself reads the canvas back; 121
without it). Edge stops: same material, normal (cosine^32), distance from the pixel's plane (2% of the distance to the
eye + 1 cm), log-luminance (0.9). A pixel listens to its neighbours fully up to 8 samples of its own and not at all
from 64. Known: the character's thin shadow softens and fades a little; highlights in car paint are smoothed.

## Flight, ported from Sketchbook (2026-09-21)

The helicopter and the aeroplane now use Sketchbook's per-step velocity edits (`vehicles/Helicopter.ts`, `Airplane.ts`)
instead of my own force model. Measured in Chrome on the playground's runway, full throttle from rest, nothing else
pressed, read through `window.__world` every 2 s: 1.6, 6.3, 9.7 m/s on the ground, airborne between 6 s and 8 s at
11.6 m/s, then 12.7, 13.2, 13.5 m/s while climbing 15.5 → 18.8 m. The same run in `tests/rt/aircraft.test.ts` on a flat
plane: on the ground at 7 s (10.75 m/s), airborne at 8 s. A 0.25 s tap of S at 13.5 m/s raised the nose and bled the
speed to 3 m/s within 6 s (it fell): under throttle Sketchbook switches its nose-follows-velocity correction off on two
axes so that loops are possible, so nothing lowers the nose again. Helicopter: Shift for 3 s after spin-up climbed
17.1 → 40.7 m; Q for 1.5 s turned it 2.2 rad; D for 1.5 s rolled it to 59° (up·y 0.51).

## The car, seats and first person, ported from Sketchbook (2026-09-21)

`tests/rt/car.test.ts`, flat ground, full throttle from rest: second gear within 2 s, fifth gear and 17–23 m/s after 14 s
(Sketchbook's fifth gear tops out at 22); full reverse settles between 2 and 4.5 m/s (its limit is 4). In Chrome on the
playground a car reached 8.5 m/s in second gear after 3 s. Engine force: Sketchbook's 500 N per wheel on a 50 kg body,
scaled by 900/50 to this body's mass; all four wheels driven, the brake on the rear pair. Seats: G from beside the rear
door put the character in seat_3, and X moved it to seat_4 and back (the rear seats connect only to each other, the
front pair to each other), as the model's `connected_seats` say.

## Head lamps and night (2026-09-21)

Spot lamps asked directly (one of up to 12 per bounce, picked in proportion to strength × cone × cosine / distance²,
one shadow ray). Read from the figure's own "one sample" readout in Chrome on the M4 Pro, 960×540, full path tracing,
standing still at the spawn point with all five cars' lamps and the searchlight lit (11 lamps): 10.4 ms and 10.5 ms;
the same night with the lamps switched off (L): 8.4 ms; by day (16:00): 8.0 ms. (This browser session was busier than
the one the article's 6.8 ms came from; compare the three with each other, not with that.) Strength 220 in the sun's
units: the sun gives 18000 × 2.14e-3 ≈ 38.5 on a facing surface, the night exposure is 6×, so 220/d² × 6 is a third of
that at 10 m.

## 2026-09-22 — the opening numbers of part two, measured again

The same view and method as the 2026-09-21 table above (player's spawn over the car park, 960×540, 8 bounces, four
16-sample bursts through `window.__lights`), now with the lamps' lenses in the models and the spot-lamp loop in the
kernel (no lamp lit by day): 6.72 and 6.59 ms a sample on two fresh loads, 35.4 node visits per ray; 11,317 moving
triangles (the figure's readout; +42 from the lenses). Frame rate while strafing, one sample a frame, three 3 s
windows: 117, 116, 117 fps (121 with nothing moving). The adaptive quality stayed at 960×540.
