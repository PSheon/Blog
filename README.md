# paul.notebook — models and systems built from scratch, running in your browser

[![CI](https://github.com/PSheon/Blog/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/PSheon/Blog/actions/workflows/ci.yml)
[![Live site](https://img.shields.io/badge/live-blog.psheon.me-79dafa)](https://blog.psheon.me)

**[blog.psheon.me](https://blog.psheon.me)** · [English](https://blog.psheon.me/en) · [中文](https://blog.psheon.me/zh) · [RSS](https://blog.psheon.me/en/feed.xml)

An interactive blog. Every article builds one thing from scratch — a CNN, a Transformer, a diffusion model,
neuroevolution, a quadruped's walking policy, a SLAM system, a city of autonomous agents, a task scheduler, a path tracer — and
ships with instruments you can train, open up and break right in the page. Apart from MuJoCo's physics in article 006,
everything is written in TypeScript and runs in the reader's tab: no TensorFlow.js, no ONNX Runtime, no server. Bilingual (繁體中文 / English).

從零實作的互動部落格：每一篇都能在瀏覽器裡訓練、拆開、弄壞。CNN、Transformer、擴散模型、神經演化、
機器狗走路策略、SLAM、自己過日子的小鎮居民、任務排程器、路徑追蹤器，全部用 TypeScript 從零寫起，不靠任何機器學習函式庫，
也不靠伺服器。

![paul.notebook](https://blog.psheon.me/en/opengraph-image)

## Articles

| № | English | 中文 |
| --- | --- | --- |
| 013 | [A mini Figure AI in three minutes: one camera, one arm](https://blog.psheon.me/en/posts/head-camera) | [三分鐘打造迷你 Figure AI：只給它一顆相機、一隻手臂](https://blog.psheon.me/zh/posts/head-camera) |
| 012 | [Putting a path tracer in a 3D playground: crash a car, gun a plane, fly a helicopter](https://blog.psheon.me/en/posts/light-playground) | [把光追放進 3D 遊樂園：體驗開車碰撞、飛機加速、直升機飛行](https://blog.psheon.me/zh/posts/light-playground) |
| 011 | [How a picture clears from snow: a WebGPU path tracer from scratch](https://blog.psheon.me/en/posts/light-from-noise) | [一張圖怎麼從雪花變清晰：從零寫一個 WebGPU 路徑追蹤器](https://blog.psheon.me/zh/posts/light-from-noise) |
| 010 | [A task scheduler from scratch](https://blog.psheon.me/en/posts/task-scheduler) | [從零打造一個任務排程器](https://blog.psheon.me/zh/posts/task-scheduler) |
| 009 | [A city nobody schedules — 300 people, each minding their own needs](https://blog.psheon.me/en/posts/city-of-agents) | [沒有人排班的城市：300 個小人各忙各的](https://blog.psheon.me/zh/posts/city-of-agents) |
| 008 | [Drawing the map while finding yourself on it — SLAM from scratch](https://blog.psheon.me/en/posts/slam-2d) | [一邊畫地圖，一邊找自己](https://blog.psheon.me/zh/posts/slam-2d) |
| 007 | [How a cloud of noise becomes an apple: a 3-D diffusion model trained in the browser](https://blog.psheon.me/en/posts/diffusion-points) | [一團雜訊怎麼長成一顆蘋果](https://blog.psheon.me/zh/posts/diffusion-points) |
| 006 | [A robot dog in the browser: its walking policy is four matrix multiplications (MuJoCo WASM)](https://blog.psheon.me/en/posts/lite3-walking) | [把一隻機器狗搬進瀏覽器](https://blog.psheon.me/zh/posts/lite3-walking) |
| 005 | [One body, two heads: a multi-task HydraNet that draws boxes and masks](https://blog.psheon.me/en/posts/hydranet-fruit) | [一個身體，兩個頭：HydraNet](https://blog.psheon.me/zh/posts/hydranet-fruit) |
| 004 | [Training a Transformer from scratch: autodiff engine, attention maps](https://blog.psheon.me/en/posts/transformer-from-scratch) | [在瀏覽器裡從零訓練一個 Transformer](https://blog.psheon.me/zh/posts/transformer-from-scratch) |
| 003 | [A neuroevolution trading squad on 2024 AAPL prices](https://blog.psheon.me/en/posts/trading-agent) | [打造神經進化交易戰隊](https://blog.psheon.me/zh/posts/trading-agent) |
| 002 | [Neuroevolution: 50 birds teach themselves Flappy Bird](https://blog.psheon.me/en/posts/ai-flappy-bird) | [讓 50 隻小鳥自己學會 Flappy Bird](https://blog.psheon.me/zh/posts/ai-flappy-bird) |
| 001 | [A CNN from scratch: watching a convolutional network see](https://blog.psheon.me/en/posts/cnn-from-scratch) | [從零開始的 CNN](https://blog.psheon.me/zh/posts/cnn-from-scratch) |

Built with Next.js 16 (App Router, static generation) · MDX · shadcn/ui (Base UI) · Tailwind v4 · TypeScript ·
Three.js, MuJoCo WebAssembly and WebGPU where an article needs them. The site is a PWA: a hand-written
service worker (`public/sw.js`) keeps articles readable offline.

## Develop

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # vitest (tests/): lib/ml gradients and golden values, content and search, every article's simulation
pnpm e2e          # playwright: builds, serves and tests the site, incl. axe on every page in both themes
pnpm lint && pnpm typecheck && pnpm build
```

The canonical origin (RSS, sitemap, metadata, OG images) comes from `NEXT_PUBLIC_SITE_URL` if set,
otherwise from the production domain Vercel assigns (`lib/site.ts`). Production sets it to
`https://blog.psheon.me`; preview deployments take their origin from Vercel.

Branches: work on `dev`; `main` changes only through a pull request. Vercel deploys `main` to
production and gives every pull request a preview. Where the project stands and what is in flight:
[`docs/HANDOFF.md`](docs/HANDOFF.md).

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
| `content/posts` | The articles; each one's interactive components live beside it |
| `lib/ml` | Dependency-free ML: tensor ops and an inference `Sequential`; neuroevolution; a reverse-mode autodiff engine (matrix and image ops, every one checked against finite differences); a decoder-only Transformer; Adam |
| `lib/rt` | The path tracer for the light series: scene, BVH, a CPU reference and the WebGPU kernel |
| `lib/content` | Post index, frontmatter schema, table of contents, reading time, the operator count on the home page |
| `lib/search.ts` | Full-text index builder and ranking (substring matching, so Chinese works) |
| `lib/seo.ts`, `lib/site.ts` | Canonical URLs, hreflang and Open Graph basics; the site's origin |
| `lib/og` | Open Graph card renderer (subsets a CJK font at build time) |
| `lib/i18n` | Locales and typed UI dictionaries |
| `lib/three.ts` | The named three.js exports the 3D figures use, so the bundle can be trimmed |
| `components/site` | Header, home page (hero, post bento, previews), search palette, PWA install and service worker |
| `components/article` | Article chrome: table of contents, reading progress, footer |
| `components/lab` | The `Instrument` frame and shared instrument parts |
| `components/rt` | The path tracer's stage, worker and React hook |
| `components/mdx` | Prose components |
| `components/ui` | shadcn/ui components, plus layout primitives ported from Launch UI |
| `styles/launch-ui.css` | Glass, fade and hairline utilities from Launch UI |
| `public/sw.js` | The service worker (network first for pages, cache first for immutable assets) |
| `scripts/train-mnist` | One-off PyTorch training for article 001; exports weights and golden values for the tests |
| `scripts/light` | Packs the light series' assets (the playground, the vehicles, the character and its clips) into `public/posts/light-playground/*.bin`: geometry, skeleton and names only, never a texture |
| `tests` | Vitest suites, grouped by library and by article |
| `e2e` | Playwright smoke tests and axe accessibility checks |
| `docs/research`, `docs/reviews` | Measurements and notes behind article decisions; editorial and external reviews |

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
AAPL price data in the trading article is daily closing prices for 2024. The Lite3 robot model and
walking policy in article 006 come from DEEP Robotics; their licences are in `public/lite3/`. The light
series' playground is the geometry of [Sketchbook](https://github.com/swift502/Sketchbook)'s world by
Jan Blaha (MIT); its textures are not used and `world.glb` is never committed.
