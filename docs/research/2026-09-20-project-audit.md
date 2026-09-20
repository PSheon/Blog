# Project audit, 2026-09-20 (after release 42a822a)

What was measured, how, and what is worth doing, ranked. Production is https://paul-notebook.vercel.app and the code is
`dev` at 95f8354. Nothing was changed for this audit. "Verified" means it was measured or reproduced. "Read" means it was
seen in the code only. "Guess" is marked as such.

## How it was measured

- Lighthouse 12, phone profile with simulated throttling, against production, one run per page.
- Bundle contents: the chunks referenced by each prerendered HTML file in `.next/server/app`, gzipped.
- Two build experiments on the article bundle, both reverted.
- `curl` against production for headers, metadata, feeds, the manifest and 404s.
- Offline behaviour in a fresh browser context.
- knip, `pnpm outdated`, `pnpm audit --prod`, and `tsc` once per strict flag.

## Lighthouse (phone, production)

| Page | Perf | LCP | TBT | Transfer |
|---|---|---|---|---|
| /zh | 92 | 2.7 s | 20 ms | 363 KB |
| /zh/posts | 93 | 2.7 s | 10 ms | 349 KB |
| cnn-from-scratch | 81 | 3.9 s | 80 ms | 547 KB |
| ai-flappy-bird | 100 | 1.5 s | 10 ms | 484 KB |
| trading-agent | 95 | 2.8 s | 0 ms | 476 KB |
| transformer-from-scratch | 95 | 1.9 s | 0 ms | 561 KB |
| hydranet-fruit | 77 | 3.9 s | 210 ms | 537 KB |
| lite3-walking | 90 | 3.0 s | 0 ms | 591 KB |
| diffusion-points | 84 | 3.0 s | 70 ms | 776 KB |
| slam-2d | 96 | 2.5 s | 50 ms | 683 KB |

Accessibility, Best Practices and SEO are 100 on all ten pages. CLS is at most 0.001. These are simulated numbers. There
is no real-user data, because Speed Insights is not switched on in the Vercel dashboard.

## Tier 1: a reader can see these, or they cost every reader

1. **Every article downloads every other article's demo code.** Verified, and the fix is tested.
   - All eight articles reference the same 17 scripts, 292 KB gzipped. The trading article ships the SLAM chunk
     (54 KB raw), Lite3 (28 KB) and diffusion (40 KB).
   - The cause is `import(`@/content/posts/${slug}/${locale}.mdx`)` in `app/[locale]/posts/[slug]/page.tsx:61`. Next
     collects client components per route, not per slug.
   - Experiment A, an explicit `slug → () => import(...)` map: no change, 17 scripts and 292 KB.
   - Experiment B, `slam-2d/components/index.ts` as a client file exporting `next/dynamic` wrappers with SSR left on:
     the trading article fell to 16 scripts and 272 KB, and the SLAM page still server-rendered its seven instruments.
   - Done the same day for all eight, as one chunk per article (`components/labs.ts`, with `components/index.ts` the
     lazy client wrappers). Every article: 13 page scripts, 203 KB gzip, down from 17 and 292 KB, and no other
     article's test ids in its scripts. Instruments are still server-rendered. They come alive 0.3–0.5 s after the
     page on a throttled slow-4G phone profile (1.6 Mbps, 150 ms RTT, 4× CPU). A test that clicks inside that window
     loses the click, so the E2E fixture now waits for `[data-lab]` to hydrate.
   - The estimate made before doing it: all eight should bring a text-only page load to about 215 KB (estimate). The Next docs say the
     split only happens when a client file does the lazy import.
2. **SLAM's 3D views ignore a theme switch.** Verified in the browser. Switching dark to light leaves the grid and
   lidar rays in their dark-theme colours, nearly invisible on the light background, until a reload. The ink colour is
   read once (`stage3d.ts:24`, `drive-view3d.ts:47`, `cloud-lab.tsx:38`, `outcomes-view3d.ts:26`). Lite3 handles this
   with `retheme()`.
3. **SLAM (№ 008) has no cover drawing.** Verified. `components/site/post-cover.tsx:183` lists seven slugs, so SLAM
   gets the generic cover on the home page and the index. DESIGN.md requires one per article. The README's article
   table also stops at 007.
4. **A first visit is not available offline.** Verified by the agent in a fresh context. After one visit and then
   going offline, a reload shows the offline page. `public/sw.js` only caches what passes through it after it takes
   control, and the first document and its assets load before that. `offline.html` says "articles you have already
   opened work offline", which is false for a one-visit reader. Fix: once the worker is active, the page asks it to
   cache `location.href` and the resources already loaded.
5. **The installed PWA opened offline always shows the offline page.** Verified. `start_url` is `/`, which redirects
   by language, and a redirect is never cached. Fix: answer `/` from a cached `/zh` or `/en`, or set the start URL to
   a locale. The manifest also lacks `id` and `lang`, and mixes a zh name with an en description.
6. **404s under `/zh/*` and `/en/*` server-render an empty shell.** Verified with curl. The response is a 404 with
   `<html id="__next_error__">`, no `lang`, the home page's `<title>`, and no h1. The designed 404 appears only after
   JS runs. A top-level `/nope` renders correctly through `global-not-found.tsx`.
   - Cause, found by experiment afterwards. The root layout lives under `[locale]`, so the app root has no layout and
     no not-found. When `notFound()` reaches Next's server pass, it looks for a root-level not-found to render, finds
     none, and sends the error shell (`getErrorRSCPayload` in `app-render.js`). The client then draws
     `[locale]/not-found.tsx`. The status is still 404 and the response still carries noindex.
   - Tried, no effect: `dynamicParams = true` on the pages; removing `dynamicParams = false` from the layout, which
     only removes the `NoFallbackError` log line; `globalNotFound: false`; removing the `PageSwap` wrapper.
   - Options. (a) Accept it: only no-JS readers and the tab title lose. (b) Answer unknown URLs from `proxy.ts` with
     a rewrite to a real 404 page, which means the proxy must know every slug and tag. (c) Move `<html>` into an
     `app/layout.tsx`, which then cannot know the locale for `lang` on the server. Not fixed; (a) for now.
7. **HydraNet (77) and CNN (81) are the slow pages.** The largest element is the lead paragraph, held back 2–3 s by
   script work during hydration. HydraNet has 208 ms and 115 ms long tasks in the shared chunk. Item 1 removes part of
   that. The rest is their own demos starting before anyone scrolls to them; SLAM's lazy start fixed the same problem.

## Tier 2: search, sharing and accessibility

8. `/posts`, `/tags` and tag pages have no `og:image`, and their twitter card is `summary`. Verified.
   `sharedMetadata()` replaces `openGraph` wholesale. Fix: add the locale's OG image there.
9. Five SLAM canvases have no accessible name and are not `aria-hidden` (`drive-lab.tsx:117`, `cloud-lab.tsx:90`,
   `springs-lab.tsx:97`, `outcomes-lab.tsx:46`, `wheels-lab.tsx:67`, `align-lab.tsx:76`). axe has no rule for it, so
   the a11y suite passes. Read.
10. The align-lab translation is drag-only, with no keyboard path. Read.
11. Three articles have no sources section: trading-agent (no provenance for `aapl-2024.json`), transformer (no
    Vaswani et al.) and cnn (MNIST uncredited). This breaks the rule that every number is attributed. SLAM's two
    papers are not linked.
12. 16 of the 48 sitemap URLs are tag pages with one post. Fix: noindex when a tag has fewer than two posts, and
    leave them out of the sitemap.
13. The `/en` meta description is 198 characters. Four en titles are 60–62 characters with the site suffix.
14. The drawer's close button says "Close" to zh screen readers (`components/ui/sheet.tsx:75`). The NavProgress
    label bypasses the dictionary (`layout.tsx`).
15. RSS is summary-only, with no `content:encoded` and no `lastBuildDate`. `/feed.xml` and `/rss.xml` return 404.
16. Every article prefetches the RSC payloads of 5–6 other articles through the footer links, about 60–100 KB br per
    page view. The service worker stores every `?_rsc=` variant and never evicts them.
17. In-prose cross-links: diffusion-points and hydranet-fruit link to nothing and nothing links to them. slam-2d has
    no inbound link.

## Tier 3: code health and CI

18. `docs/HANDOFF.md` is stale: the dev SHA, the worktree names, the test counts, 005 and 006 listed as drafts, and
    the fly article planned as 007. Memory tells every new session to start there.
19. One test is the whole unit-test time. `tests/ml/autopilot.test.ts:32` takes 30 s of a 31 s suite. Ten starts by
    default, with `PILOT_FULL` for the rest, brings `pnpm test` to about 9 s.
20. `e2e/smoke.spec.ts:295` still skips when hydranet-fruit returns 404, "still a draft". It would now hide a real
    regression. Verified.
21. `shadcn`, the CLI, is a production dependency used for one 16 KB CSS file. It brings 33 direct deps, and the prod
    tree is 607 packages. Vendor the CSS. `@types/mdx` belongs in devDependencies.
22. `pnpm audit --prod` reports 2 high advisories in `toml` via `remark-mdx-frontmatter`. It runs at build time on
    our own YAML frontmatter, so the real risk is nil, but it is noise.
23. Duplication with three or more copies:
    - the three.js stage set-up, 6 copies; a shared one is also where item 2 gets fixed once
    - the frame-budget training loop, 4–5 copies
    - `useLabels()`, 8 copies
    - canvas DPR sizing, 7 copies, three of them uncapped, so they draw 3× on a 3× phone
    - Box-Muller, 5 copies
24. Dead code:
    - `diffuse()` in `diffusion.ts:150`
    - `driveLaps()` in `car.ts:106`
    - the `tapConv`, `leak` and `meanRows` Tape ops left from the fly spike, which ship in three bundles
    - unused shadcn re-exports, and 18 of the 20 utilities in `styles/launch-ui.css`
25. Hex colours in components (`stage3d.ts:9` and others) duplicate the dark-theme tokens, so they do not follow the
    light theme. Fix together with item 2.
26. E2E gaps. 10 of the 44 `data-testid`s appear in no spec. HeadsRace and GuidanceLab are the most logic-heavy
    untested instruments. `slam-2d/outcomes.ts` would make a cheap unit test.
27. Strict flags that cost nothing: `noFallthroughCasesInSwitch`, `noUnusedLocals` and `noUnusedParameters` give 0
    errors; `noImplicitOverride` gives 3 and `noImplicitReturns` gives 1. `noUncheckedIndexedAccess` gives 1067 and is
    not worth it.
28. `vite-tsconfig-paths` is redundant under Vitest 5. `@types/node` is 20 while CI runs Node 22. TypeScript 7 and
    ESLint 10 are majors behind.
29. CI takes about 4 minutes, 205 s of it E2E. Caching the Playwright browser saves about 22 s.

## Security headers

Present: HSTS with preload, nosniff, Referrer-Policy, X-Frame-Options, Permissions-Policy. Missing: CSP and
`Cross-Origin-Opener-Policy: same-origin`. A realistic CSP needs `'unsafe-inline'` for scripts (next-themes, JSON-LD
and the RSC pushes on prerendered pages, no nonces) and for styles (KaTeX). It needs `'wasm-unsafe-eval'`. It also
needs `'unsafe-eval'` on the Lite3 article only, because MuJoCo's Embind glue calls `new Function`. With no user input
the XSS value is small; the gain is `base-uri`, `object-src` and `frame-ancestors`.

## Checked and fine

- **Search metadata:** canonicals, hreflang with x-default on every page and in the sitemap, and JSON-LD (every
  required BlogPosting field). OG images on the home page and articles.
- **Delivery:** cache headers and brotli on everything compressible, including `.wasm` and `.bin`.
- **Links and parity:** all 18 external links and every internal link and anchor resolve. zh/en parity of headings,
  components and measurements.
- **Page structure:** one h1 per page and no heading skips.
- **Motion and WebGL:** reduced-motion coverage for every keyframe in `globals.css`. All six WebGL renderers are
  disposed.
- **Code hygiene:** no `any` and no `@ts-` comments. No unused classes or keyframes in `globals.css`. Nothing unused
  in `public/`.
- **Repo size:** the largest tracked file is 740 KB.
