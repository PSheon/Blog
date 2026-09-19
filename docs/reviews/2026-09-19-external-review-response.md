# Response to the external architecture review (2026-09-19)

The review was written without access to the source, from the README, PR #1 and the rendered site, and asks
for every item to be checked against the real files. This is that check. "Measured" means on this machine
(M-series Mac, Chrome) against production or a local production build.

| Item | Verdict | What was found | What was done |
| --- | --- | --- | --- |
| H1 maths shown twice | **Not real** | 20 formulas on a page, 0 visible TeX copies. `katex.min.css` is imported by the article route; the reviewer read the HTML without CSS. | E2E test: the `.katex-mathml` copies stay ≤ 1 px. |
| H2 home TBT ~500 ms, perf 78 | **Stale** | 3 Lighthouse mobile runs: performance 93, TBT 10–20 ms, CLS 0. Fixed earlier by loading the hero classifier on demand. | Nothing. |
| H3 training freezes the main thread | **Mostly not real** | Training loops spend an 11 ms budget per animation frame. Transformer: 0 long tasks in 8 s. HydraNet: 8 long tasks, worst 71 ms, because the once-a-second evaluation shared a frame with training. | Evaluation gets its own frame: 1 long task, worst 53 ms. No Web Worker: nothing measured justifies it. |
| H4 Lite3 assets | **Partly real** | Policy is already raw float32 and br-compressed; the WASM is br + immutable. But the 8 STL files (770 KB) were served **uncompressed** (Vercel does not compress `model/stl`) and everything under `/lite3` was `max-age=0`. No SharedArrayBuffer is used, so no COOP/COEP. | Meshes renamed `.bin` (octet-stream is compressed); `/lite3/*` is `immutable` for a year and requested with `?v=ASSET_VERSION`. Compression can only be confirmed on a Vercel deployment. |
| H5 security headers | **Real** | Only HSTS (from Vercel). | `nosniff`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, no `X-Powered-By`. **No CSP**: a strict one needs per-request nonces, which would turn every static page dynamic; a loose one (`unsafe-inline`) protects little. Left as a decision. |
| M1 allocation in `lib/ml` hot loops | **Not worth it** | 250 HydraNet training steps: 85 collections, 23 ms of 3,889 ms = 0.6 % in GC. | Nothing. |
| M2 WebGPU / SIMD | Agree with the review | Would break the from-scratch premise. Note the review is wrong that Lite3 uses ONNX Runtime: the policy runs on `lib/ml`. | Nothing. |
| M3 hydration cost | Already handled | Heavy client parts are `next/dynamic`; home TBT is 10–20 ms. | Nothing. |
| M4 dependencies | Partly wrong | No `onnxruntime-web` in the project. `three` and `@mujoco/mujoco` load only after a click in one article (E2E asserts it). | Nothing. |
| M5 bilingual parity | **Real gap** | Nothing stopped `zh.mdx` and `en.mdx` drifting apart. | `tests/content/parity.test.ts`: number, date, tags and flags must match; published articles need an English version; search titles and descriptions must fit a results page. It caught one: Lite3's zh description was 91 characters. |
| M6 CI | **Real** | No workflow existed; "2 checks passed" on PR #1 was Vercel. | `.github/workflows/ci.yml`: lint, typecheck, unit tests; production build + Playwright + axe. Unverified until it runs on GitHub (WebGL in the Lite3 test on a Linux runner is the risk). |
| L2 reduced motion | Partly | Flappy, the conv stepper and Lite3 honour it; training instruments only move after the reader presses a button. | Nothing. |
| L3 hreflang tests | Done before the review | x-default, hreflang, feed link and Open Graph are pinned by E2E tests. | — |
| L5 LICENSE | **Real, Paul's call** | No LICENSE file. Third-party licences for Lite3 are in `public/lite3`. | Nothing: which licence is not for an assistant to pick. |
| L6 commit hygiene | Noted | — | — |
