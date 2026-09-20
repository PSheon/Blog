# Performance audit, 2026-09-20

Lighthouse 12, mobile preset (4× CPU, slow 4G, simulated), local production build, M-series Mac. One run per page
unless noted. "fonts" and "js" are transferred bytes.

| Page | perf | FCP | LCP | TBT | CLS | total | js | fonts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| /zh | 92 | 1.4 s | 3.4 s | 10 ms | 0 | 516 KB | 278 KB | 132 KB |
| /zh/posts | 93 | 1.4 s | 3.2 s | 0 ms | 0 | 510 KB | 271 KB | 132 KB |
| 001 cnn | 83 | 2.3 s | 4.4 s | 10 ms | 0 | 584 KB | 289 KB | 217 KB |
| 002 flappy | 89 | 1.5 s | 3.8 s | 0 ms | 0 | 481 KB | 267 KB | 132 KB |
| 003 trading | 89 | 1.5 s | 3.8 s | 0 ms | 0.001 | 467 KB | 267 KB | 132 KB |
| 004 transformer | 84 | 2.1 s | 4.2 s | 0 ms | 0 | 555 KB | 267 KB | 194 KB |
| 005 hydranet | 84 | 2.1 s | 4.2 s | 90 ms | 0 | 514 KB | 263 KB | 186 KB |
| 006 lite3 | 83 | 2.1 s | 4.4 s | 0 ms | 0.001 | 585 KB | 267 KB | 241 KB |
| 007 diffusion | 87 | 1.7 s | 3.9 s | 50 ms | 0 | 773 KB | 455 KB | 216 KB |
| 008 slam, before | **59** | 1.5 s | 3.8 s | **3,390 ms** | 0 | 667 KB | 449 KB | 132 KB |
| 008 slam, after | **89** | | 3.8 s | **40 ms** | 0 | | | |

## Fixed

**№ 008 froze the page while loading.** Two figures (wheels, springs) replayed a fixed autopilot drive inside
`useMemo`, i.e. during hydration: one lap is 981 steps with a lidar sweep each, 266 ms in Node, three laps in all,
and Lighthouse saw long tasks of 2,264 ms and 1,161 ms. Now `driveLapsSliced` (car.ts) does the same drive in 6 ms
slices, `useReplay` starts it only when the figure is within 1,200 px of the viewport, and the drift slider
cancels and restarts it instead of blocking for half a second per notch. three.js in the first figure loads on
`requestIdleCallback`, like № 007.

## Looked at, left alone

- **LCP 3.2–4.4 s** is the throttling model: the LCP element is a paragraph of text, its render delay is
  50–115 ms, and the observed (unthrottled) LCP is ~140 ms. Nothing cheap moves it.
- **Articles with maths are ~0.6 s slower to first paint** (2.1–2.3 s vs 1.5 s) and carry 50–110 KB more fonts
  (KaTeX). Blocking the KaTeX fonts in an experiment made FCP worse, not better (fallback requests), so the fonts are
  not the simple cause. Switching KaTeX to MathML-only output would drop those fonts and 5 KB of render-blocking
  CSS, but changes how every formula looks on every platform; not done without Paul seeing it.
- **three.js is ~170 KB** on 006, 007 and 008. It loads on click (006) or when idle (007, 008). A hand-picked
  re-export module might tree-shake 20–30 %; `WebGLRenderer` is most of it. Not done.
- **278 KB of JS on the home page** is React + Next + the header/search shell; the hero classifier, search palette
  and mobile drawer are already lazy.
