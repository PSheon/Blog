# Handoff plan: home page, phone usability, loading states, PWA (2026-09-20)

Written by session paul-49 (the technical-editor session) for the main session to take over. Paul asked four
questions about the site; this is the analysis and the proposed work. **Nothing here has been implemented.**
No file outside this note was touched for it.

Measured on a production build of branch `edit/tech-review` (= `edit/series` + `dev` @ 491450a + text edits only),
Playwright Chromium, `isMobile`, widths 320 / 360 / 390, all 11 routes × zh/en = 66 page loads, each scrolled to
the bottom.

## What was measured

- Horizontal overflow: **0 of 66**. No element sticks out past the viewport; wide things (code blocks, KaTeX
  display maths, the HydraNet tables) scroll inside their own containers.
- Canvases: none with zero size, none wider than the viewport (the CNN article has 56).
- Console errors: 0.
- Instruments work on a phone: the E2E `mobile` project (Pixel 7) drives every one of them and passed (91 passed,
  1 skipped).
- **Two real findings, both tap targets** (DOM box sizes; not tried on a real phone):
  - The sidenote superscript button is **7×12 px**. On a phone it is how a reader opens a sidenote. 2–5 per article.
  - `input[type=range]` boxes are **10×10 px** (Lite3, diffusion, trading: a dozen or so). Draggable, but the
    touchable height is too small. WCAG 2.5.8 asks for 24×24.
- Phone first screen of the home page (390×800) shows the headline, the intro and two buttons. The drawable
  instrument, the site's main selling point, is on the second screen.
- PWA: no manifest and no service worker. `themeColor` is already set in `app/[locale]/layout.tsx`. (Measured at
  dev 491450a there was no apple-touch-icon either; the main session reports that `app/apple-icon.tsx` exists as of
  dev da0f74c, so that item is done.)

## Proposed work, in order

### 1. Tap targets and the phone hero (small, measurable, no risk)

- Enlarge the hit area of the sidenote button and the range inputs to at least 24×24 with CSS only (padding or a
  pseudo-element); appearance unchanged. Re-measure with the same script idea: every `main button` and
  `input[type=range]` has a box ≥ 24 px in both directions.
- On phones, put the hero instrument directly under the headline and move the intro below it, or step the headline
  down a size, so the instrument is at least partly on the first screen at 390×800. The lazy placeholder must keep
  mirroring the real layout (CLS must stay 0).

### 2. Hero headline — WAITING FOR PAUL, do not pick for him

`hero.tagline` (`lib/i18n/dictionaries/{zh,en}.ts`) is also the three stops of `TriadRail`
(`computer-vision` / `llm` / `ai-agent`, currently 2 / 1 / 3 posts). "思考" has one post, and № 007
(`generative`) has no stop at all, so the taxonomy no longer fits the content. Options put to Paul:

| | Headline | For | Against |
| --- | --- | --- | --- |
| A (recommended) | 「把模型拆開來看」, rail stays below | true of every article; survives new topics | loses the three-word, three-colour rhythm |
| B | 「看見 生成 行動」 | smallest change; `generative` gets a stop | the Transformer under "生成" is a stretch |
| C | 「畫一個數字，看它怎麼想」 | points at the instrument beside it; strongest hook | tied to that one demo |

Paul has said before that titles keep their hook (memory: `titles-keep-the-hook`). If the tagline stops being three
words, `TriadRail`, `home.topics` and the `locale === "en" && "."` rendering in `app/[locale]/page.tsx` all change
with it.

### 3. PWA (no new dependency)

- `app/manifest.ts`: name, `display: "standalone"`, both theme colours, 192 and 512 PNG icons plus a maskable one,
  apple-touch-icon.
- Hand-written `public/sw.js` (~60 lines): HTML **network-first** with cache fallback; `/_next/static`, model
  weights and `/lite3/*` cache-first; an offline fallback page.
- Three traps:
  1. Stale content is the classic PWA failure. HTML must be network-first, the worker versioned, and a kill switch
     ready (a worker that unregisters itself and clears caches).
  2. Do not precache the 4.5 MB MuJoCo bundle; cache it only after the reader presses "載入模擬器".
  3. Do not register the worker on Vercel preview deployments.
- Test: an E2E that loads an article, goes offline (`context.setOffline(true)`), reloads, and trains the Transformer.

### 4. Loading states — not a full-screen splash

Pages are static; project notes record Lighthouse mobile 93 and an observed LCP of about 140 ms. A splash would
cover a page that is already painted and would cost that score. Handle the three places a reader actually waits:

1. Navigation: a top progress bar that appears only after ~150 ms.
2. Instruments: skeleton animation and, for Lite3, a percentage while the 4.5 MB loads.
3. Launch from the home screen: the manifest's `background_color` and icon give a system splash for free.

If Paul wants a branded entrance: under 300 ms, once per session, honours `prefers-reduced-motion`, never blocks
content, and measured against LCP before it ships.

## Also waiting in this worktree (separate from the above)

`/Users/paul_jiang/Desktop/Paul/Blog-review`, branch `edit/tech-review`, **uncommitted, not pushed**: a technical
edit of all seven articles in zh and en (en.mdx for 002 and 003 re-translated in full; 001/004/005/006 brought
back in line with zh), plus seeded measurement scripts under `docs/research/{evolution-seeds,transformer-steps}`
and `docs/research/diffusion-spike/clamp*`. Lint, typecheck, 186 unit tests, production build and E2E all pass
there. Paul has the diagnosis and the open decisions in the paul-49 conversation; he has not yet said whether to
commit. It touches only `content/posts/*/{zh,en}.mdx` and `docs/research/`.
