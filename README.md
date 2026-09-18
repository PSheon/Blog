# paul.notebook

Paul's lab notebook on machines that see and agents that act: bilingual (中文 / English)
articles with interactive, in-browser ML demos written from scratch in TypeScript.

Next.js 16 · MDX · shadcn/ui · Tailwind v4 · TypeScript

## Develop

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # vitest: lib/ml, lib/content, drawing pipeline
pnpm e2e          # playwright: builds, serves and smoke-tests the site
pnpm lint && pnpm typecheck && pnpm build
```

The canonical origin (RSS, sitemap, metadata) comes from `NEXT_PUBLIC_SITE_URL` if set, otherwise from the
production domain Vercel assigns. Set the variable once a custom domain is attached.

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
draft: true                    # optional — visible in `pnpm dev` only
---
```

`Figure`, `Instrument`, `Sidenote` and `Callout` are available in every article without an
import. See `content/posts/cnn-from-scratch` for a full interactive article that uses them.

## Layout

| Path | What lives there |
| --- | --- |
| `lib/ml` | Dependency-free tensor ops and a `Sequential` model that returns every layer's activations |
| `lib/content` | Post index, frontmatter schema, table of contents, reading time |
| `lib/i18n` | Locales and typed UI dictionaries |
| `components/lab` | The `Instrument` frame shared by every interactive figure |
| `components/mdx` | Prose components |
| `scripts/train-mnist` | One-off PyTorch training; exports weights and golden values for the tests |

Retrain the digit classifier with:

```bash
uv run --with torch --with torchvision --with numpy python scripts/train-mnist/train.py
```

Branches: `main` holds releases, development happens on `dev`.
