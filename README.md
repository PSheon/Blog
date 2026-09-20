# paul.notebook — machine learning models built from scratch, trained in your browser

[![CI](https://github.com/PSheon/Blog/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/PSheon/Blog/actions/workflows/ci.yml)
[![Live site](https://img.shields.io/badge/live-paul--notebook.vercel.app-79dafa)](https://paul-notebook.vercel.app)

**[paul-notebook.vercel.app](https://paul-notebook.vercel.app)** · [English](https://paul-notebook.vercel.app/en) · [中文](https://paul-notebook.vercel.app/zh) · [RSS](https://paul-notebook.vercel.app/en/feed.xml)

An interactive machine-learning blog. Every article takes one model apart — a CNN, a Transformer, a
diffusion model, neuroevolution, a quadruped's walking policy — and ships with instruments you can train,
open up and break right in the page. The models are written from scratch in TypeScript: no TensorFlow.js,
no ONNX Runtime, no server. Bilingual (繁體中文 / English).

從零實作機器學習模型的互動部落格：每一篇都能在瀏覽器裡訓練、拆開、弄壞。CNN、Transformer、擴散模型、
神經演化、機器狗走路策略，全部用 TypeScript 從零寫起，不靠任何機器學習函式庫。

![paul.notebook](https://paul-notebook.vercel.app/en/opengraph-image)

## Articles

| № | English | 中文 |
| --- | --- | --- |
| 009 | [A city nobody schedules — 300 people, each minding their own needs](https://paul-notebook.vercel.app/en/posts/city-of-agents) | [沒有人排班的城市：300 個小人各忙各的](https://paul-notebook.vercel.app/zh/posts/city-of-agents) |
| 008 | [Drawing the map while finding yourself on it — SLAM from scratch](https://paul-notebook.vercel.app/en/posts/slam-2d) | [一邊畫地圖，一邊找自己](https://paul-notebook.vercel.app/zh/posts/slam-2d) |
| 007 | [How a cloud of noise becomes an apple: a 3-D diffusion model trained in the browser](https://paul-notebook.vercel.app/en/posts/diffusion-points) | [一團雜訊怎麼長成一顆蘋果](https://paul-notebook.vercel.app/zh/posts/diffusion-points) |
| 006 | [A robot dog in the browser: its walking policy is four matrix multiplications (MuJoCo WASM)](https://paul-notebook.vercel.app/en/posts/lite3-walking) | [把一隻機器狗搬進瀏覽器](https://paul-notebook.vercel.app/zh/posts/lite3-walking) |
| 005 | [One body, two heads: a multi-task HydraNet that draws boxes and masks](https://paul-notebook.vercel.app/en/posts/hydranet-fruit) | [一個身體，兩個頭：HydraNet](https://paul-notebook.vercel.app/zh/posts/hydranet-fruit) |
| 004 | [Training a Transformer from scratch: autodiff engine, attention maps](https://paul-notebook.vercel.app/en/posts/transformer-from-scratch) | [在瀏覽器裡從零訓練一個 Transformer](https://paul-notebook.vercel.app/zh/posts/transformer-from-scratch) |
| 003 | [A neuroevolution trading squad on 2024 AAPL prices](https://paul-notebook.vercel.app/en/posts/trading-agent) | [打造神經進化交易戰隊](https://paul-notebook.vercel.app/zh/posts/trading-agent) |
| 002 | [Neuroevolution: 50 birds teach themselves Flappy Bird](https://paul-notebook.vercel.app/en/posts/ai-flappy-bird) | [讓 50 隻小鳥自己學會 Flappy Bird](https://paul-notebook.vercel.app/zh/posts/ai-flappy-bird) |
| 001 | [A CNN from scratch: watching a convolutional network see](https://paul-notebook.vercel.app/en/posts/cnn-from-scratch) | [從零開始的 CNN](https://paul-notebook.vercel.app/zh/posts/cnn-from-scratch) |

Built with Next.js 16 (App Router, static generation) · MDX · shadcn/ui (Base UI) · Tailwind v4 · TypeScript ·
Three.js and MuJoCo WebAssembly where an article needs them.

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
interactive: true              # optional — shows the "interactive" badge
draft: true                    # optional — built in `pnpm dev` only, never in production
---
```

**Read [`docs/DESIGN.md`](docs/DESIGN.md) first**: the design system — tokens, components, interaction and
accessibility rules, content rules and the publishing checklist.

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
