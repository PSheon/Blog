# Interactive AI Blog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a bilingual Next.js + MDX + shadcn/ui blog with a complete home page, a complete article page, and one fully interactive CNN article whose inference runs in pure TypeScript.

**Architecture:** File-based MDX posts (`content/posts/<slug>/{zh,en}.mdx`) compiled by `@next/mdx` so each article imports and code-splits its own interactive components. A zero-dependency `lib/ml` runs forward passes and exposes every intermediate activation to the visualisations. All pages are statically generated under `/[locale]`.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, pnpm, Tailwind v4, shadcn/ui, @next/mdx, zod, gray-matter, Shiki (rehype-pretty-code), KaTeX, vitest, Playwright, PyTorch via `uv` (training only).

**Spec:** `docs/superpowers/specs/2026-09-18-interactive-ai-blog-design.md`

## Global Constraints

- Work on branch `dev`; `main` only receives releases. Commit after every task.
- Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Locales are exactly `zh` and `en`; `zh` is the default. `<html lang>` is `zh-Hant-TW` / `en`.
- A post exists iff `content/posts/<slug>/zh.mdx` exists. Invalid frontmatter fails the build.
- `lib/ml` has zero runtime dependencies and must run in Node and the browser.
- Tensors are NCHW `Float32Array`. Golden-value tolerance is `1e-4`.
- Turbopack: MDX remark/rehype plugins are passed **as string names with JSON-serialisable options**.
- Colours only through CSS-variable tokens; no hard-coded hex in components. Text contrast ≥ WCAG AA in both themes.
- Every animation honours `prefers-reduced-motion`. Every control is keyboard-operable. Canvas supports touch.
- Reading time: 400 CJK chars/min + 220 Latin words/min, rounded up, minimum 1.
- Before any merge to `main`: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all pass.

## File Structure

```
next.config.mjs            MDX + plugin wiring
proxy.ts                   "/" → "/zh" | "/en" by Accept-Language
mdx-components.tsx         global MDX element map
app/layout.tsx             root: fonts, <html>, theme provider
app/globals.css            tokens, @theme inline, prose styles
app/[locale]/layout.tsx    header, footer, dictionary provider
app/[locale]/page.tsx                  home
app/[locale]/posts/page.tsx            index
app/[locale]/posts/[slug]/page.tsx     article
app/[locale]/posts/[slug]/opengraph-image.tsx
app/[locale]/tags/[tag]/page.tsx
app/[locale]/about/page.tsx
app/[locale]/feed.xml/route.ts
app/sitemap.ts, app/robots.ts
lib/i18n/{config.ts,dictionaries/zh.ts,dictionaries/en.ts,index.ts}
lib/content/{schema.ts,reading-time.ts,toc.ts,posts.ts,search-index.ts}
lib/ml/{tensor.ts,ops.ts,sequential.ts,weights.ts,index.ts}
lib/site.ts                site constants (name, url, author, links)
components/ui/*            shadcn
components/site/*          header, footer, locale-switch, theme-toggle, search, post-row, featured-card, hero
components/article/*       article-header, toc, progress, sidenote layout, post-footer
components/mdx/*           figure, sidenote, callout, code-block, heading
components/lab/*           instrument, readout, controls, heatmap-canvas, error-boundary
content/posts/cnn-from-scratch/{zh.mdx,en.mdx,weights.json,components/*}
content/posts/hello-notebook/{zh.mdx,en.mdx}     typography/components showcase
content/posts/edge-perception-notes/zh.mdx       zh-only, exercises locale fallback
scripts/train-mnist/train.py
tests/ml/*, tests/content/*, tests/fixtures/*, e2e/*
```

---

### Task 1: Scaffold

**Files:** project root via `create-next-app`, `components.json`, `vitest.config.ts`, `package.json` scripts.

**Produces:** a running app; scripts `dev`, `build`, `lint`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `e2e` (`playwright test`).

- [ ] Scaffold into a temp dir and move in (the repo already has `.git`, `README.md`, `docs/`):
  `pnpm create next-app@latest /tmp-scaffold --ts --tailwind --eslint --app --turbopack --no-src-dir --import-alias "@/*" --use-pnpm --yes`, then copy everything except `.git` and `README.md`.
- [ ] `pnpm dlx shadcn@latest init -d` then add: `button badge card command dialog dropdown-menu separator slider tabs tooltip sheet toggle-group scroll-area`.
- [ ] Add deps: `@next/mdx @mdx-js/loader @mdx-js/react @types/mdx remark-frontmatter remark-mdx-frontmatter remark-gfm remark-math rehype-katex rehype-slug rehype-pretty-code shiki katex gray-matter zod next-themes github-slugger`. Dev: `vitest @vitejs/plugin-react vite-tsconfig-paths @playwright/test`.
- [ ] `vitest.config.ts` with `vite-tsconfig-paths`, `environment: "node"`, `include: ["tests/**/*.test.ts"]`.
- [ ] Verify `pnpm build` passes. Commit `chore: scaffold next.js + shadcn`.

### Task 2: `lib/ml` — tensor and ops (TDD)

**Files:** `lib/ml/tensor.ts`, `lib/ml/ops.ts`, `tests/ml/ops.test.ts`

**Produces:**
```ts
export interface Tensor { data: Float32Array; shape: number[] }
export function tensor(data: ArrayLike<number>, shape: number[]): Tensor   // throws if size mismatch
export function zeros(shape: number[]): Tensor
export function size(shape: number[]): number
export function conv2d(x: Tensor, w: Tensor, b: Tensor | null, o?: { stride?: number; padding?: number }): Tensor
  // x [N,Cin,H,W], w [Cout,Cin,kH,kW], b [Cout]; cross-correlation (PyTorch semantics)
export function maxPool2d(x: Tensor, k: number): Tensor   // stride = k, floor
export function relu(x: Tensor): Tensor
export function flatten(x: Tensor): Tensor                // [N, C*H*W]
export function dense(x: Tensor, w: Tensor, b: Tensor): Tensor  // w [out,in] (PyTorch Linear)
export function softmax(x: Tensor): Tensor                // over last dim, numerically stable
```

- [ ] Write failing tests with hand-computed values:
  - `tensor()` throws on size mismatch.
  - conv2d: 1×1×3×3 input `1..9`, 2×2 kernel `[[1,0],[0,-1]]`, no pad → `[[-4,-4],[-4,-4]]`; with bias 1 → all `-3`; padding 1 → output shape `[1,1,4,4]` and corner `[0,0] = -1`.
  - conv2d multi-channel: Cin=2, kernel of ones 1×1 → channel sum.
  - conv2d stride 2 on 4×4 with 2×2 ones kernel → `[[14,22],[46,54]]` for input `1..16`.
  - maxPool2d k=2 on 4×4 `1..16` → `[[6,8],[14,16]]`; odd size 5×5 floors to 2×2.
  - relu clamps negatives; flatten shape `[2,12]` from `[2,3,2,2]`.
  - dense: x `[1,2]`, w `[[1,2],[3,4]]`, b `[10,20]` → `[15,31]`.
  - softmax sums to 1, stable for `[1000,1001,1002]` (no NaN), argmax preserved.
- [ ] Run `pnpm test` → fails (module missing). Implement. Run → passes. Commit `feat(ml): tensor and ops`.

### Task 3: `lib/ml` — Sequential and weights (TDD)

**Files:** `lib/ml/sequential.ts`, `lib/ml/weights.ts`, `lib/ml/index.ts`, `tests/ml/sequential.test.ts`

**Produces:**
```ts
export type LayerSpec =
  | { type: "conv2d"; name: string; inC: number; outC: number; kernel: number; padding: number }
  | { type: "relu"; name: string } | { type: "maxpool"; name: string; size: number }
  | { type: "flatten"; name: string } | { type: "dense"; name: string; inF: number; outF: number }
  | { type: "softmax"; name: string }
export type Weights = Record<string, { shape: number[]; data: number[] }>   // keys "<layer>.weight" / "<layer>.bias"
export interface Activation { name: string; type: LayerSpec["type"]; output: Tensor }
export class Sequential {
  constructor(layers: LayerSpec[], weights: Weights)      // throws Error naming the key on missing/mis-shaped weights
  forward(x: Tensor): Activation[]                         // one entry per layer, in order
  predict(x: Tensor): Float32Array                         // last activation's data
}
export const MNIST_CNN: LayerSpec[]   // conv1,relu1,pool1,conv2,relu2,pool2,flatten,fc,softmax
```

- [ ] Tests: tiny 2-layer model with hand weights yields expected activations list/names/shapes; missing key throws `/conv1\.bias/`; wrong shape throws; `MNIST_CNN` with zero weights on `[1,1,28,28]` yields shapes `[1,8,28,28] … [1,16,7,7], [1,784], [1,10]` and uniform 0.1 softmax.
- [ ] Fail → implement → pass. Commit `feat(ml): sequential model and weight loading`.

### Task 4: Train MNIST CNN, export weights + golden

**Files:** `scripts/train-mnist/train.py`, `content/posts/cnn-from-scratch/weights.json`, `tests/fixtures/mnist-golden.json`, `tests/ml/golden.test.ts`

- [ ] `train.py`: model identical to `MNIST_CNN`; Adam lr 1e-3, 6 epochs, batch 128; augmentation `RandomAffine(degrees=10, translate=(0.1,0.1), scale=(0.85,1.15))`; input is raw `[0,1]` (no mean/std normalisation, so the browser needs none). Prints test accuracy; asserts ≥ 0.98. Exports weights rounded to 4 decimals keyed `conv1.weight` etc., and golden: one test image (`input` 784 floats, `label`) with `logits` and `probs` **computed from the rounded weights**.
- [ ] Run `uv run --with torch --with torchvision --with numpy python scripts/train-mnist/train.py`.
- [ ] `golden.test.ts`: load both JSONs, run `Sequential`, expect probs within `1e-4` and argmax === label. Pass. Commit `feat(ml): trained mnist weights with golden test`.

### Task 5: i18n + content library (TDD)

**Files:** `lib/i18n/*`, `lib/site.ts`, `lib/content/*`, `tests/content/*.test.ts`, `tests/fixtures/posts/**`

**Produces:**
```ts
// lib/i18n
export const locales = ["zh","en"] as const; export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = "zh"
export function isLocale(v: string): v is Locale
export function getDictionary(l: Locale): Dictionary          // en typed as `typeof zh`
export function pickLocale(acceptLanguage: string | null): Locale
// lib/content
export interface PostMeta { slug; locale; title; description; date; updated?; tags; no; featured; draft; interactive; readingMinutes; availableLocales: Locale[]; isFallback: boolean }
export function readingMinutes(source: string): number
export function extractToc(source: string): { depth: 2|3; text: string; id: string }[]   // ignores fenced code; ids via github-slugger
export function getAllPosts(locale: Locale, opts?: { dir?: string; includeDrafts?: boolean }): PostMeta[]
export function getPostMeta(slug, locale, opts?): PostMeta | null
export function getToc(slug, locale, opts?): TocItem[]
export function getAllTags(locale, opts?): { tag: string; count: number }[]
export function getAdjacentPosts(slug, locale, opts?): { prev: PostMeta|null; next: PostMeta|null }
export function getRelatedPosts(slug, locale, limit = 3, opts?): PostMeta[]
export function buildSearchIndex(locale): { slug; title; description; tags; headings: string[] }[]
```
The MDX module itself is loaded in the page with `await import(\`@/content/posts/${slug}/${file}.mdx\`)`.

- [ ] Tests (fixtures dir with 3 posts: bilingual, zh-only, draft): sorted by date desc; draft excluded unless `includeDrafts`; zh-only post appears in `en` with `isFallback: true` and `availableLocales: ["zh"]`; invalid frontmatter throws with file path; `readingMinutes("字"×800) === 2`, 440 English words → 2, empty → 1; TOC skips `## ` inside code fences and dedupes ids; adjacent/related correctness; `pickLocale("en-US,en;q=0.9") === "en"`, `"zh-TW"` → `zh`, `null` → `zh`.
- [ ] Fail → implement → pass. Commit `feat(content): post index, toc, i18n`.

### Task 6: MDX pipeline + design tokens + root layout

**Files:** `next.config.mjs`, `mdx-components.tsx`, `app/globals.css`, `app/layout.tsx`, `proxy.ts`, `components/theme-provider.tsx`

- [ ] `next.config.mjs`: `pageExtensions` incl. `mdx`; `createMDX({ options: { remarkPlugins: ["remark-frontmatter", ["remark-mdx-frontmatter",{name:"frontmatter"}], "remark-gfm", "remark-math"], rehypePlugins: ["rehype-slug","rehype-katex",["rehype-pretty-code",{theme:{dark:"github-dark-dimmed",light:"github-light"},keepBackground:false}]] } })`.
- [ ] Tokens (`:root` = light paper, `.dark` = navy) mapped with `@theme inline`; extra tokens `--signal`, `--signal-2`, `--grid`, `--paper`. Fonts via `next/font/google`: Source Serif 4, Noto Serif TC, Space Grotesk, Noto Sans TC, JetBrains Mono → `--font-serif|sans|mono`.
- [ ] `.prose-notebook` styles in `globals.css`: 68ch, 18px/1.8, headings, links, lists, blockquote, tables, inline code, `[data-rehype-pretty-code-figure]` incl. dual-theme token spans, line highlight, KaTeX overflow.
- [ ] `proxy.ts`: redirect `/` → `/${pickLocale(header)}`; matcher `["/"]`.
- [ ] Verify build. Commit `feat: mdx pipeline and lab-notebook tokens`.

### Task 7: MDX components + Instrument shell

**Files:** `components/mdx/{figure,sidenote,callout,code-block,heading}.tsx`, `components/lab/{instrument,readout,controls,error-boundary,use-reduced-motion}.tsx`

**Produces:**
```tsx
<Figure size="inline|wide|full" fig="01" caption>…</Figure>
<Sidenote>…</Sidenote>            // numbered via CSS counter; margin ≥1280px, inline toggle below
<Callout type="note|warn|insight" title?>…</Callout>
<Instrument fig="03" title="conv2d" size="inline|wide|full" caption? fallback?>…</Instrument>
<Readout label value unit? tone="signal|amber|muted" />
<Controls playing onPlay onPause onStep onReset disabled? />
```
- [ ] `Instrument` = mono title bar (`FIG.03 · conv2d`, status dot), dot-grid stage, optional footer; wraps children in `ErrorBoundary` rendering the static fallback; `<noscript>` caption. Code block gets filename header + copy button.
- [ ] Commit `feat: mdx components and instrument shell`.

### Task 8: Site chrome

**Files:** `app/[locale]/layout.tsx`, `components/site/{header,footer,locale-switch,theme-toggle,search}.tsx`

- [ ] `generateStaticParams` for locales; `notFound()` on unknown locale; sets `lang` through root layout param. Header: wordmark `paul.notebook`, nav, ⌘K search (shadcn `Command` in `Dialog`, index passed from server, client-side filter, grouped by posts/tags), locale switch preserving the current path, theme toggle. Mobile nav in `Sheet`. Footer: RSS, GitHub, colophon.
- [ ] Commit `feat: site header, footer, search`.

### Task 9: Home page

**Files:** `app/[locale]/page.tsx`, `components/site/{hero,hero-instrument,featured-card,post-row,tag-filter,about-strip}.tsx`

- [ ] Hero: tagline See · Think · Act + intro; `HeroInstrument` (client, `dynamic` import of weights on first pointer interaction / idle) reusing the article's `DigitCanvas` + probability bars in compact form. Featured card. Notebook index rows (`№`, date, title, description, tags, minutes, interactive badge) with client tag filter. About strip.
- [ ] Commit `feat: home page`.

### Task 10: Article page + listing pages

**Files:** `app/[locale]/posts/[slug]/page.tsx`, `components/article/{article-header,toc,progress,post-footer,fallback-banner}.tsx`, `app/[locale]/posts/page.tsx`, `app/[locale]/tags/[tag]/page.tsx`, `app/[locale]/about/page.tsx`

- [ ] Article: `generateStaticParams` (all slugs × locales), `dynamicParams = false`, `generateMetadata` with hreflang alternates. Grid `[toc 220px][body 68ch][margin 260px]`; TOC scroll-spy via `IntersectionObserver`; progress bar; fallback banner; post footer (tags, edit link, prev/next, related).
- [ ] Commit `feat: article, posts, tags, about pages`.

### Task 11: CNN article

**Files:** `content/posts/cnn-from-scratch/{zh.mdx,en.mdx}`, `components/{use-model.ts,preprocess.ts,digit-canvas.tsx,prob-bars.tsx,kernel-playground.tsx,conv-stepper.tsx,draw-predict.tsx,feature-maps.tsx,occlusion-map.tsx,heatmap.ts,store.ts}`, `tests/ml/preprocess.test.ts`

**Produces:**
```ts
export function preprocess(rgbaOrGray: Float32Array /* 280*280, 0..1 ink */, srcSize: number): Float32Array /* 784 */
  // bbox crop → scale longest side to 20px (area average) → place by centre of mass in 28×28; empty → zeros
export function useModel(): { model: Sequential | null; status: "idle"|"loading"|"ready"|"error"; retry(): void }
```
- [ ] TDD `preprocess`: empty canvas → all zeros; an off-centre blob ends with centre of mass within 0.5px of (14,14); output max ≤ 1; bbox longest side 20±1.
- [ ] The drawing is shared between DrawPredict, FeatureMaps and OcclusionMap through a small external store (`useSyncExternalStore`) so the three figures stay in sync across the article.
- [ ] Occlusion: 4×4 grey patch, stride 2, chunked with `requestIdleCallback` (fallback `setTimeout`), cancellable on new input.
- [ ] Write the prose in both languages (intro → convolution → kernels → pooling → the full network → draw it → what it sees → what matters → limits & next).
- [ ] Commit `feat(post): a cnn from scratch`.

### Task 12: Remaining content, feeds, SEO

**Files:** `content/posts/hello-notebook/*`, `content/posts/edge-perception-notes/zh.mdx`, `app/[locale]/feed.xml/route.ts`, `app/sitemap.ts`, `app/robots.ts`, `app/[locale]/posts/[slug]/opengraph-image.tsx`

- [ ] Commit `feat: showcase posts, rss, sitemap, og images`.

### Task 13: E2E + verification

**Files:** `playwright.config.ts`, `e2e/smoke.spec.ts`

- [ ] Tests: `/` redirects to a locale; home renders in both locales; locale switch keeps the path; article has TOC + ≥5 instruments; drawing a vertical stroke on the canvas yields a prediction readout that is a digit; zh-only post in `/en` shows the fallback banner; ⌘K finds "CNN"; no console errors on home and article.
- [ ] Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e`. Review screenshots (desktop + 390px mobile, both themes) and fix visual issues. Commit.
