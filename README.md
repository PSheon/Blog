# paul.notebook

Paul's lab notebook on machines that see and agents that act: bilingual (中文 / English)
articles with interactive, in-browser ML demos written from scratch in TypeScript.

Live at <https://paul-notebook.vercel.app>.

Next.js 16 · MDX · shadcn/ui (Base UI) · Tailwind v4 · TypeScript

## Develop

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # vitest: lib/ml, lib/content, lib/search, article models
pnpm e2e          # playwright: builds, serves and tests the site, incl. axe on every page in both themes
pnpm lint && pnpm typecheck && pnpm build
```

The canonical origin (RSS, sitemap, metadata, OG images) comes from `NEXT_PUBLIC_SITE_URL` if set,
otherwise from the production domain Vercel assigns. Set the variable once a custom domain is attached.

Branches: work on `dev`; `main` changes only through a pull request. Vercel deploys `main` to
production and gives every pull request a preview.

## Write a post

```
content/posts/<slug>/
  zh.mdx          required — a post exists once this file does
  en.mdx          optional — without it, /en serves the zh text with a notice
  components/     interactive components, imported by the article itself
```

Frontmatter is validated at build time (`lib/content/schema.ts`); a bad field fails the build
and names the file.

```yaml
---
title: …
description: …
date: 2026-09-18
tags: [computer-vision, cnn]   # lowercase kebab-case
no: 3                          # notebook entry number
featured: true                 # optional — home page feature slot
interactive: true              # optional — shows the "interactive" badge
draft: true                    # optional — built in `pnpm dev` only, never in production
---
```

`Figure`, `Instrument`, `Sidenote` and `Callout` are available in every article without an
import. `content/posts/cnn-from-scratch` is a full example.

Conventions that keep pages fast and honest:

- An article's components live next to it and are imported by the MDX file, so they are code-split
  per article. Anything heavy that isn't needed for first paint (models, dialogs) is loaded with
  `next/dynamic` behind a placeholder of the same shape.
- A number in an article should be reproducible: measured in a test, by a script under
  `docs/research/`, or live in the reader's browser. Say which.
- Inside an `Instrument`, titles are `<p>`, not headings; instruments can appear before the
  article's first `h2`.

## Layout

| Path | What lives there |
| --- | --- |
| `lib/ml` | Dependency-free ML: tensor ops and an inference `Sequential`; neuroevolution; a reverse-mode autodiff engine (matrix and image ops, every one checked against finite differences); a decoder-only Transformer; Adam |
| `lib/content` | Post index, frontmatter schema, table of contents, reading time |
| `lib/search.ts` | Full-text index builder and ranking (substring matching, so Chinese works) |
| `lib/og` | Open Graph card renderer (subsets a CJK font at build time) |
| `lib/i18n` | Locales and typed UI dictionaries |
| `components/lab` | The `Instrument` frame and shared instrument parts |
| `components/mdx` | Prose components |
| `components/ui` | shadcn/ui components, plus layout primitives ported from Launch UI |
| `styles/launch-ui.css` | Glass, fade and hairline utilities from Launch UI |
| `scripts/train-mnist` | One-off PyTorch training for article 001; exports weights and golden values for the tests |
| `docs/research` | Measurements and notes behind article design decisions |
| `e2e` | Playwright smoke tests and axe accessibility checks |

Retrain the digit classifier with:

```bash
uv run --with torch --with torchvision --with numpy python scripts/train-mnist/train.py
```

## Performance and accessibility budget

Measured with Lighthouse on a production build (mobile preset, throttled): accessibility, best
practices and SEO at 100; performance in the high 80s to mid 90s; about 0.5 MB per page; no layout
shift. Chinese is set in system fonts on purpose: CJK web fonts cost about 2 MB and 220 KB of
render-blocking CSS and took first paint from 1.2 s to 14 s.

## Credits

Layout primitives and CSS utilities adapted from [Launch UI](https://www.launchuicomponents.com).
AAPL price data in the trading article is daily closing prices for 2024.
