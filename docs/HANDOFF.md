# Handoff — main session, last revised 2026-09-23

For whoever picks this up next. Read this, then the memory files under
`~/.claude/projects/-Users-paul-jiang-Desktop-Paul/memory/` (they are loaded automatically, this file is not), then
`docs/DESIGN.md` before touching anything a reader sees. SHAs and counts go stale within a day: trust `git fetch`,
`git log` and a test run over this file.

## Where things stand

| | |
| --- | --- |
| Repo | `/Users/paul_jiang/Desktop/Paul/Blog`, GitHub `PSheon/Blog` (public) |
| Branches | `dev` is where work happens. `main` is production and moves only through a PR `dev` → `main` that Paul merges (last: PR #15, 2026-09-22) |
| Production | <https://blog.psheon.me> (since 2026-09-21; DNS on Cloudflare, CNAME to Vercel, DNS only). Vercel project `paul-notebook`, deploys `main`. `paul-notebook.vercel.app` redirects 308 to it, path kept. Production env: `NEXT_PUBLIC_SITE_URL=https://blog.psheon.me` |
| Dev server | `pnpm dev` on :3000 |
| Other worktrees | None since 2026-09-22: `feat/city-of-agents`, `feat/sche` and `feat/vla` are merged and deleted. One writer per checkout |
| Tests | 323 unit tests (2 skipped) and 218 E2E runs (two projects: desktop, mobile), plus axe on every article. CI runs all of it on every push |

Published, in both languages: 001 CNN, 002 Flappy Bird, 003 trading agent, 004 Transformer, 005 HydraNet, 006 Lite3,
007 point-cloud diffusion, 008 2D SLAM, 009 city of agents, 010 a task scheduler from scratch (published 2026-09-21;
built on `feat/sche` by another session), 011 and 012 the light series (PR #14), 013 `head-camera` (PR #15, merged from
`feat/vla`), 014 `music-ai` (2026-09-23). Articles 001–013 had their copy polished with Paul on 2026-09-22, item by
item, and 014 the same way as it was written. The earlier PCB-flip
VLA draft (№ 014) was dropped the same day, Paul found it dull; its simulation (arm, rasteriser, world) lives on as
`content/posts/head-camera/components/sim`, which 013 imports, with its tests in `tests/head-camera/`; its notes stay
in `docs/research/pcb-flip-vla/`. A draft shows only in `next dev`, with a mark in the page's language ("草稿" / "DRAFT").

### № 014, the AI composer (2026-09-23)

A small Transformer (65k parameters, `lib/ml` again) learns Bach's four-part chorales in the reader's browser in about
three minutes, and a synthesiser written sample by sample plays what it writes. Three figures: train and listen,
tune it with your own picks (DPO, and it games the judge), and a blind test against Bach and five lines of maths.

- `docs/research/music-ai/RESULTS.md` holds every number, both recipes (the research schedule and the page's), the
  timbre work and the measurements that were thrown away. Copies of the research scripts sit beside it.
- The data is **CC BY-NC-SA 4.0** (Craig Sapp's edition of the chorales), and so are `public/posts/music-ai/*.bin`
  and anything else derived from them: attribution is in the README, the article and the licence note.
- `scripts/music/convert.py` and `scripts/music/pack.ts` rebuild those two files byte for byte from the corpus clone
  and a checkpoint, both of which live outside git in `Desktop/Paul/music-work/` (with every run and the MP3 packs).
- Sound has its own rules now: DESIGN.md §4 "Instruments that make sound". The player is one `AudioContext` and one
  worker for the page; figures 02 and 03 share a second worker, and every message carries which figure asked.
- CI cannot hear: `e2e/music-ai.spec.ts` checks training, tuning, the blind test's secrecy and that nothing heavy is
  fetched before the reader asks.

### № 015, the Starship landing — DRAFT, PAUSED (2026-09-23)

Everything is on `dev` and `draft: true`. Paul read it and said the prose is **不有趣，又有一點雜亂**; he is waiting
for Fable to write it. **Do not rewrite the article without him.** The machinery under it is finished and measured.

- The physics and the pilot are `content/posts/rocket-landing/components/{sim,pilot}.ts`. The one idea worth keeping
  hold of: one Raptor spans 0.90–2.26 MN and the ship weighs 1.26 MN, so a single engine straddles its own weight
  and two do not. The pilot therefore asks for a thrust and lights the fewest engines that can deliver it, and a
  descent goes 0 → 1 → 2 → 1 by itself.
- `docs/research/rocket/RESULTS.md` has every number, including the two I got wrong: an `engines` override meant the
  learned engine counts never touched the score (I nearly published the noise), and a reward hack I predicted did
  not happen. Measurement scripts are live code in `scripts/rocket/`, not copies, so lint and tsc keep them honest.
- The figure has four pilots and two trainers. `e2e/rocket-landing.spec.ts` covers them and skips while the article
  is a draft — flip `draft` to run it.
- What the editorial pass found, if it helps whoever writes it: the three best moments (it cannot hover; the flip
  throws it 64 m sideways so it must aim off-target; the network hovering 3 m above the deck for 90 seconds) are all
  buried in engineering notes, the engine-count thread is told three separate times, and the last three sections
  share one shape — setup, table, moral.

### The light series (two articles, published 2026-09-22)

`light-from-noise` (№ 011, part one: what path tracing is) and `light-playground` (№ 012, part two: a playground you
walk, drive and fly through, path traced every frame). Paul cut the plan from four articles to two because theory-first
articles bore him; what the engine can do beyond the two articles (four sampling strategies, MIS, a white furnace)
stays in `lib/rt` with its tests. Read before touching it:

- `docs/research/light/RESULTS.md`: every number in the articles, how it was measured, and the measuring mistakes
  (u32 counters overflow with 64-sample bursts at 960 × 540: use 16; wait for the figure's loop to be idle).
- `lib/rt/`: scene, SAH BVH, CPU reference, the WGSL kernel (`kernel.ts`: path tracing, NEE/MIS, GGX, glass, outdoors,
  a second tree for moving things, temporal reprojection, an à-trous filter), `gpu.ts` (the Renderer), `dynamic.ts`
  (prepared trees refitted per frame), `playground.ts`, `models.ts`, `boxman.ts` (assets and CPU skinning).
  The kernel is AT the default limit of 8 storage buffers per stage: one more needs `requiredLimits`.
  `tests/rt/wgsl.test.ts` checks the shaders for WGSL reserved words, which reached the browser three times.
- `components/rt/`: `use-tracer.ts` (worker build, frame loop, waits for Start, paces by elapsed time), `stage.tsx`.
  In development `window.__lights[<canvas test id>]` and `window.__world` are there for measurements.
- The game is `content/posts/light-playground/components/game/`: `character.ts` is Sketchbook's character state machine
  ported state for state (its source, MIT, is cloned for reference at `../light-work/sketchbook-src`), `world.ts` is
  Rapier, `car.ts`, `aircraft.ts`. All of it has tests that need no GPU (`tests/rt/`); Rapier runs in vitest.
- Assets are packed by `scripts/light/pack-*.mjs` from `../light-work/assets/*.glb`. **`world.glb` must never be
  committed**: it embeds Textures.com photographs. The packed files hold geometry, skeleton, clips and names only, and
  tests check that no image is inside.
- CI has no GPU. The light E2E tests take the "no adapter" branch; what needs a GPU was checked by hand
  in the Playwright MCP browser, whose own tab must be in front for pointer lock (a `newContext()` window is refused).

## Waiting on Paul

- Switch on Analytics and Speed Insights in the Vercel dashboard. Every performance number we have is simulated.
- A test on a real phone. Nobody has done one.
- Search Console (the verification env vars exist). The custom domain is done. Open: should `psheon.me` and `www.psheon.me` redirect to `blog.` instead of serving the site too.
- What is still open from the last audit: `docs/research/2026-09-20-project-audit.md`.

## Rules Paul has set (also in memory)

- Commit messages follow Conventional Commits, `type(scope): summary`. Which type, which scope and how to word the
  summary are in [COMMITS.md](COMMITS.md); read it before the first commit. `.githooks/commit-msg` refuses anything else
  (`pnpm install` points git at it). PR titles take the same form.
- Never move or push `main`. Releases are a PR `dev` → `main` that he merges. "Deploy" is not "release".
- Never force-push `dev`. Paul and Dependabot merge into `dev` on GitHub, so `git fetch && git status -sb` before
  every commit and push; on a rejected push, `git rebase origin/dev`, and tell him.
- Before saying a branch is merged, check `git rev-list --count dev..<branch>` is 0.
- Titles and slogans keep an energetic hook; offer three or four options. He rejects flat, "AI-sounding" ones, and
  dull prose-first work: show something visible first.
- Look at every UI change in a real browser before reporting it: desktop 1440/1920, phone 390, both
  themes. Measure (pixels, computed styles, Lighthouse) instead of theorising. He caught me three times.
- Read the dev console once per page.
- Numbers in articles must be measured and attributed (live / on my machine / offline with N seeds).
  Twice a claim I wrote from reasoning was wrong once measured.
- Polishing copy: list every change with the exact before and after text, numbered, and apply only what he picks.
  Never touch an article's `date` or `updated`; the spread of dates is deliberate.

## Things that will bite you

- shadcn here is the **Base UI** flavour: `render` prop, not `asChild`. It needs the `cn` npm package.
- Launch UI is Radix-based. Only `components/ui/{footer,navbar}.tsx` and `styles/launch-ui.css` were
  ported. Never run its base install.
- Objects passed from server to client components must not contain functions (dictionaries did → 500).
- Language switch is a plain `<a>` on purpose (a client transition remounts next-themes' script).
- Turbopack: MDX plugins and any asset config in `next.config.mjs` must be JSON-serialisable.
- Don't toggle the theme in tests by editing `<html class>`; canvases won't repaint. Set
  `localStorage.theme` and reload.
- Killing `next start`: `lsof -ti tcp:<port> | xargs kill -9`. `pkill -f "next start"` leaves
  `next-server` alive and you end up testing a stale build.
- `vitest` probes that build the function under test from `rand()` *inside* the closure give garbage
  finite differences. Hoist the probes.
- Chinese uses system fonts deliberately (CJK web fonts cost 2 MB + 220 KB blocking CSS, FCP 14 s).
- Heavy client code (search palette, mobile drawer, hero classifier, featured preview) is loaded with
  `next/dynamic`. A lazy component's placeholder must mirror the real layout, or CLS comes back.
- All articles share one route, so each article's `components/index.ts` is a `"use client"` file of `next/dynamic`
  wrappers over `./labs`. Plain re-exports ship every article's instruments with every article (DESIGN.md).
- Never put `update=` on a layout-level `<ViewTransition>`: a `next/dynamic` placeholder swap is an update, and it
  replayed the page transition on every load of the home page. The swap is keyed by pathname (`page-swap.tsx`).
- An overlay that mounts lazily must mount closed and open a frame later, or its first opening has no animation.
- `next/link` calls `preventDefault` before the bubble phase: listen for navigation clicks in the capture phase.
- A service worker hides requests from `page.route`: `test.use({ serviceWorkers: "block" })` where a test routes.
- A worker's script must never be answered from a cache: the bundler passes its chunk list in the URL fragment, which
  a Request does not carry (`public/sw.js` lets `request.destination === "worker"` through). After a deploy, a reader
  who already has the old service worker gets one page load under it, where every instrument that uses a worker sits
  still; their next load has the new one. Verified on production on 2026-09-23.
- Instruments hydrate a moment after the page. The E2E fixture in `smoke.spec.ts` waits for `[data-lab]`; a test
  with its own `page` must do the same before clicking.
- 404s: see "How a URL that does not exist is answered" below before touching `dynamicParams`, `notFound()` or the proxy.
- A yielding loop: MessageChannel, not nested `setTimeout(0)` (clamped to 4 ms). A time budget only works if one
  unit of work is much smaller than the budget.
  When a unit of work CANNOT be made small — Brent's rho advances y by r steps and r doubles, so at 96 bits one
  unit is 2.1 s with no chance to check the clock — the answer is not a smaller budget but a worker you can
  `terminate()` (measured by paul-e9, `docs/research/rsa/RESULTS.md`).
- Inside an `Instrument`, titles are `<p>`, not headings (axe `heading-order`).
- Scrollable regions (tables, display maths) need `tabIndex={0}` + a name (axe).
- An `IntersectionObserver` callback gets a batch: read the LAST entry, not `([entry]) =>`, or a quick scroll
  leaves a figure paused while visible. `tests/site/observers.test.ts` refuses the first-entry form.

## How a URL that does not exist is answered

Four pieces cooperate, because the root layout lives under `[locale]` and nothing can sit above it. This is the part of
the site most likely to break on a Next upgrade: after one, run the 404 tests in `e2e/smoke.spec.ts` against a
production build and read the server log for `NoFallbackError`.

| The reader asks for | What happens |
| --- | --- |
| `/` | `proxy.ts` redirects to `/zh` or `/en` by `Accept-Language` (the official i18n pattern). |
| `/zh/posts/no-such`, `/en/tags/no-such` | The route matches; the slug or tag is rendered on demand (`dynamicParams = true`); the PAGE calls `notFound()`. Status 404, `noindex`. |
| `/zh/anything/else` | `app/[locale]/[...rest]/page.tsx` matches and calls `notFound()`. |
| `/nope` (one segment, not a locale) | Matches `[locale]`. The LAYOUT does not throw: it dresses the page in the default language, and `app/[locale]/page.tsx` calls `notFound()`. |
| `/no/such/path` (deep, not under a locale) | `proxy.ts` rewrites it to `/not-found`, which is the row above. The status stays 404. |
| a draft's URL, in production | `getPostMeta()` answers null for a draft wherever drafts are not shown, so it is the second row. |

In every row the body is `components/site/not-found-body.tsx`: one language when the URL starts with `/zh` or `/en`,
both when it does not. The server sends an empty shell and the client draws the page (audit, item 6); that is a
limitation of this layout, not a bug to chase.

Three things NOT to do, each tried and measured:
- `dynamicParams = false` anywhere, the leaf routes included: an unknown value then makes Next throw
  `Internal: NoFallbackError`, a full-screen runtime error in `next dev` (HTTP 500) and a log line in production.
- `notFound()` in the layout: nothing above the root layout can catch it, and `/nope` gets the framework's bare 404.
- Trusting the static params to keep drafts private. They did, by accident, until slugs were rendered on demand.

The price of rendering unknown URLs on demand is one function invocation per distinct junk URL. If a crawler makes
that matter, the answer is a rate limit on `/zh/posts/*`, `/en/posts/*` and the tag paths in Vercel's Firewall
(Paul's dashboard), not a change to the routes.

## Before upgrading Next

- `experimental.globalNotFound` is still experimental in 16.3 and `app/global-not-found.tsx` depends on it. With
  `[locale]` open it is no longer reached in practice, but keep it until a production build proves it is dead.
- Caching here is Next 16's "previous model": `dynamic = "force-static"`, `dynamicParams`, `generateStaticParams`. It is
  supported. `cacheComponents` + `"use cache"` is where Next is going, and turning it on forbids `dynamic` and
  `dynamicParams`: the table above would have to be rethought first.
- `typedRoutes` was tried on 2026-09-21 and dropped: its `Route` type rejects a dynamic route passed through a prop
  (`"/zh/posts/cnn-from-scratch"` is not a `Route`), so every component that takes an href needs a generic or a cast,
  and a cast is the check switched off. `tests/content/links.test.ts` covers the real risk instead: an article slug
  written into the site's code must belong to a published article.
- The React Compiler is not on. Two files memoise by hand; the instruments that redraw often do it in canvas loops
  outside React. Try it only with a before-and-after measurement and the full E2E run, not before a release.
- `lib/content/posts.ts` and `lib/og/render.tsx` import `"server-only"`; vitest aliases it to an empty module.
- The share cards fetch a Noto Sans TC subset from Google Fonts at build time: three tries, a warning if they fail, and
  on a production deployment a failed build, so a Chinese card can no longer fall back to Latin text unnoticed.

## Measured state of the site

Lighthouse, phone profile, production, 2026-09-20: performance 77–100 (HydraNet 77 and CNN 81 are the slow ones),
accessibility, best practices and SEO 100 on all ten pages, CLS ≤ 0.001. Page scripts per article: 203 KB gzip after
the per-article split. Numbers, method and what is left: `docs/research/2026-09-20-project-audit.md` and
`docs/research/2026-09-20-performance-audit.md`.

## Known gaps, deliberately left

- Windows shows Chinese serif text in PMingLiU (system font trade-off).
- Going *back* has no page transition (React's default for history navigation).
- Moving to `blog.psheon.me` changed every RSS guid (subscribers saw all items once more) and left localStorage and installed PWAs on the old origin. Previews still take their origin from Vercel (`lib/site.ts`).
- Article 005: "unseen emoji" and cross-OS domain shift are stated as unmeasured guesses.
- No CSP (what one would need is in the audit). KaTeX is not MathML: switching changes how formulas look.
- Idea not started: live MNIST training as an upgrade to article 001 (conv backward exists).

## Other sessions

Sessions come and go; `ListAgents` shows who is there. None owns a branch today. When one does, tell
them when `dev` changes under them, with the SHA and the files likely to conflict. Peers cannot approve anything on
Paul's behalf, and a force-push of their own branch is theirs to clear with Paul.

## Useful commands

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm e2e && pnpm build
E2E_PORT=3217 pnpm e2e            # when another checkout is using 3210
PILOT_FULL=1 pnpm test            # the full 200-start autopilot sweep
# Lighthouse against a local production build
pnpm build && pnpm start -p 3300 &
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  npx lighthouse http://localhost:3300/zh --quiet --chrome-flags="--headless=new" --output=json --output-path=/tmp/lh.json
```
