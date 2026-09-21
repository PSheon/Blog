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
