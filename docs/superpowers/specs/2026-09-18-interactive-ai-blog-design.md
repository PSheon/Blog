# Interactive AI Blog — Design

Date: 2026-09-18 · Status: approved in chat · Branch: `dev`

## Goal

A bilingual (zh-TW / en) personal blog for Paul's AI writing, where articles embed
interactive, in-browser ML demos written in TypeScript. First release ships the full
blog system, a complete home page and article page design, and one complete
interactive article: a CNN handwritten-digit recogniser.

Out of scope for this release: the Transformer article, comments, newsletter,
analytics, CMS, ONNX Runtime Web integration (the "hybrid" path is kept open by
architecture, not built).

## Stack

- Next.js 16 (App Router, Turbopack), React 19, TypeScript strict, pnpm
- Tailwind CSS v4 + shadcn/ui (CSS-variable tokens, `@theme inline`)
- `@next/mdx` with remark-frontmatter, remark-mdx-frontmatter, remark-gfm,
  remark-math, rehype-katex, rehype-slug, rehype-pretty-code (Shiki)
- zod for frontmatter validation, gray-matter for the build-time index
- vitest (unit), Playwright (smoke)
- Deploy: Vercel from `PSheon/Blog`

### Why `@next/mdx`

Compiled-string MDX pipelines (content-collections, Velite) cannot `import` inside
an article, which forces every interactive component into a global component map
and into every page's bundle. With `@next/mdx` each article imports its own
components, so demo code and model weights are code-split per article.

## Content model

```
content/posts/<slug>/
  zh.mdx            required for a post to exist in zh
  en.mdx            optional
  components/       article-local interactive components
  weights.json      article-local assets (optional)
```

Frontmatter (zod-validated at build; an invalid post fails the build):

| field | type | notes |
|---|---|---|
| `title` | string | |
| `description` | string | used for cards, meta, OG |
| `date` | ISO date | |
| `updated` | ISO date? | |
| `tags` | string[] | lowercase kebab |
| `no` | number | notebook entry number, shown as `№ 001` |
| `featured` | boolean? | home page feature slot |
| `draft` | boolean? | excluded in production |
| `interactive` | boolean? | shows the "interactive" badge |

`lib/content` exposes:

- `getAllPosts(locale)` → sorted `PostMeta[]` (drafts filtered in production)
- `getPost(slug, locale)` → `{ meta, Content, toc, availableLocales, isFallback }`
- `getAllTags(locale)`, `getAdjacentPosts(slug, locale)`, `getRelatedPosts(slug, locale)`

Locale fallback: if `<locale>.mdx` is missing, the other locale's file renders with
a banner ("This article is only available in 中文"). Never a 404 for an existing slug.

Reading time: CJK characters counted at 400/min, Latin words at 220/min.

## Routing

```
/                          → redirect to /zh or /en by Accept-Language (proxy.ts)
/[locale]                  home
/[locale]/posts            index with tag filter
/[locale]/posts/[slug]     article
/[locale]/tags/[tag]       tag listing
/[locale]/about            about
/[locale]/feed.xml         RSS
/sitemap.xml, /robots.txt
/[locale]/posts/[slug]/opengraph-image   dynamic OG
```

All pages are statically generated (`generateStaticParams`). UI strings live in
`lib/i18n/dictionaries/{zh,en}.ts`, typed so that a missing key is a compile error.
`<html lang>` is `zh-Hant-TW` or `en`; `hreflang` alternates are emitted.

## Design system — "Lab Notebook"

A research notebook with instruments embedded in it: long-form serif reading,
monospace instrument labels, thin rules, numeric readouts.

**Colour** (shadcn tokens, dark-first, complete light theme):

| role | dark | light |
|---|---|---|
| background | `#0A0A23` family (deep navy) | warm paper white |
| foreground | cool off-white | navy ink |
| primary / signal | cyan `#79DAFA` | deep cyan-blue (AA on paper) |
| secondary signal | amber | burnt amber |
| rule / border | navy +12% L | ink 12% alpha |

Exact values are fixed during implementation and verified for WCAG AA contrast.

**Type**: body Source Serif 4 + Noto Serif TC; UI/labels JetBrains Mono;
headings Space Grotesk + Noto Sans TC. Loaded via `next/font`. Body 18px/1.8 for zh,
68ch measure.

**Motifs**: fine dot-grid backgrounds on instruments, `FIG.03 · conv2d` mono captions,
entry numbers `№ 001`, hairline rules, tabular numerals for readouts.
Motion is restrained and honours `prefers-reduced-motion`.

### Home page

1. **Header** — wordmark, Posts / Tags / About, ⌘K search, locale switch, theme toggle.
2. **Hero** — tagline "See · Think · Act" + one-paragraph intro, beside a live
   mini-instrument: draw a digit, watch the CNN predict. Weights are lazy-loaded;
   before load the panel shows a static looping trace so LCP is unaffected.
3. **Featured entry** — large card for the `featured` post.
4. **Notebook index** — dense list rows: `№`, date, title, description, tags,
   reading time, interactive badge. Tag filter chips above.
5. **About strip** — short bio, focus areas (CV · Multi-agent · LLM · Edge), links.
6. **Footer** — RSS, GitHub, colophon.

### Article page

- Reading progress bar under the header.
- **Article header**: `№`, title, description, date / updated, reading time, tags,
  locale switch, fallback banner when applicable.
- **Three-column grid** (≥1280px): sticky TOC with scroll-spy (left), 68ch body
  (centre), sidenote margin (right). Below 1280px the TOC becomes a collapsible
  "On this page" and sidenotes become inline toggles.
- Figures can be `inline`, `wide` (spans into the margins) or `full`.
- **Footer**: tags, edit-on-GitHub, prev / next, up to 3 related posts (tag overlap).

### MDX components (`components/mdx`)

`Figure`, `Sidenote`, `Callout` (note / warn / insight), code blocks with filename,
copy button and line highlights, `Math` via KaTeX, styled tables, heading anchors.

### Instrument shell (`components/lab`)

`<Instrument fig="03" title="conv2d" size="wide">` provides the frame every
interactive shares: mono title bar, dot-grid stage, `<Readout>` numeric cells,
`<Controls>` (play / step / reset, sliders), and an error boundary that renders a
static fallback message instead of breaking the article.

## ML library (`lib/ml`)

Pure TypeScript, zero dependencies, runs in browser and Node.

- `Tensor` — `Float32Array` data + shape, NCHW
- `conv2d(x, w, b, { stride, padding })`, `maxPool2d`, `relu`, `flatten`, `dense`, `softmax`
- `Sequential` — runs layers and **returns every intermediate activation**, which is
  what the visualisations consume
- `loadWeights(json)` — validates shapes against the architecture

Hybrid path: a future article may use ONNX Runtime Web; it would live behind the
same `<Instrument>` shell and be dynamically imported by that article only. Nothing
is built for it now.

## CNN article — "從零開始的 CNN / A CNN From Scratch"

**Model**: Conv(1→8, 3×3, pad 1) → ReLU → MaxPool2 → Conv(8→16, 3×3, pad 1) → ReLU →
MaxPool2 → Flatten(784) → Dense(10). ~9k parameters, weights JSON rounded to 4
decimals. Target ≥ 98% MNIST test accuracy.

**Training**: `scripts/train-mnist/train.py`, run once with
`uv run --with torch --with torchvision`. Exports `weights.json` plus
`golden.json` (a fixed input with per-layer outputs) used by the TS unit tests.
Training augments with small shifts/scales so canvas drawings classify well.

**Interactive sections**:

1. **Kernel playground** — edit a 3×3 kernel (presets: edge, blur, sharpen), see the
   convolved image update.
2. **Step-through convolution** — kernel slides over a small input; the current
   window's multiply-add is written out term by term. Play / step / reset.
3. **Draw & predict** — 280×280 canvas (mouse + touch), preprocessed to 28×28 with
   MNIST-style centre-of-mass centring; live 10-class probability bars.
4. **Feature maps** — every layer's activations for the current drawing.
5. **Occlusion sensitivity** — heatmap of which pixels matter for the predicted class.

Inference runs on the main thread (< 5 ms per forward pass at this size); occlusion
(≈ 200 passes) runs in chunks via `requestIdleCallback` to keep input responsive.

## Error handling

- Invalid frontmatter or a missing `zh.mdx` → build fails with file path and field.
- Weights fetch/shape failure → instrument shows an inline error with retry.
- Instrument runtime error → error boundary fallback; the prose stays readable.
- No JS → prose, code and math fully render; instruments show a static caption.

## Testing

- **vitest**: `lib/ml` ops against PyTorch golden values (tolerance 1e-4);
  `lib/content` (sorting, draft filtering, locale fallback, reading time, TOC);
  canvas preprocessing (centring, scaling).
- **Playwright smoke**: home renders in both locales; locale switch preserves the
  path; article renders TOC and instruments; drawing on the canvas produces a
  prediction; ⌘K search finds a post; no console errors.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all pass before merge to `main`.

## Git

`main` holds releases; development happens on `dev`.
