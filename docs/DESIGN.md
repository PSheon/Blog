# paul.notebook design system — "Lab Notebook"

The rules a new article, component or page follows. It describes what is in the code today; where a rule is
enforced by a test, the test is named, and that test wins over this file if they ever disagree.
The original design brief (`docs/superpowers/specs/2026-09-18-interactive-ai-blog-design.md`) is history: its
colours and fonts were replaced during the build.

## 1. The idea

A research notebook with working instruments bound into it. Three consequences:

1. **Reading comes first.** Long-form serif text at a comfortable measure; everything else is quiet.
2. **Instruments look like bench equipment**, not like app UI: a lettered title bar, a dot-grid stage, mono
   readouts, corner marks. They all share one frame so the reader learns it once.
3. **Decoration has to mean something.** The gradient is the see → think → generate → act path; an article's
   cover drawing shows what its model does; a number on the page is counted, not typed. If a flourish says
   nothing about the content, leave it out.

## 2. Tokens

All colours are CSS variables in `app/globals.css` (`:root` = light, `.dark` = dark; dark is the default theme).
Use the Tailwind names (`text-signal`, `bg-panel`, `border-rule`); never write a hex value in a component.
The one exception is a stage that must stay dark in both themes (section 5).

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `background` | `#070918` | `#fbfbfe` | page |
| `foreground` | `#e9eaf6` | `#12162a` | text |
| `muted-foreground` | `#9b9bc4` | `#40455f` (9.1:1) | secondary text, labels |
| `panel` | `#0a0c1e` | `#eef0f8` | instrument and card surfaces |
| `border` / `rule` | lavender 18–20 % | ink 22–25 % | component borders / section rules |
| `grid` | lavender 12 % | ink 10 % | dot grid, hero grid |
| `signal` | `#79dafa` cyan | `#065a82` (7.3:1) | "see"; links, primary, live dots |
| `signal-3` | `#b9a5ff` violet | `#6347d9` | "think"; the middle of the gradient |
| `signal-2` | `#ff6e96` pink | `#c2255c` | "act"; warnings, the second series |
| `chart-1…5` | signal, signal-2, signal-3, grey, green | same roles | data series, in this order |

- The three signals are **one continuous gradient** (`.triad-gradient`, `.triad-text`), sampled from the GitHub
  profile banner. Never three flat colour blocks side by side.
- Text contrast is WCAG AA at minimum in both themes (axe checks every page in both). A new colour pair is
  measured before it ships.
- Radius is small (`--radius: 0.375rem`): `rounded-sm` for chips and canvases, `rounded-md` for panels,
  `rounded-full` only for pills and dots. Borders are 1 px. No drop shadows; depth comes from `panel`, borders and
  the two glows (`.hero-glow`, `.card-glow`).

### Type

| Role | Family | Class |
| --- | --- | --- |
| Prose, headings | Source Serif 4 + system CJK serif | `font-serif`, `font-heading` |
| UI chrome | Instrument Sans + system CJK sans | `font-sans` |
| Labels, readouts, code | JetBrains Mono | `font-mono`, `.label` |

- **Chinese uses system fonts on purpose.** CJK web fonts cost about 2 MB plus 220 KB of render-blocking CSS
  (first paint 14 s → 1.2 s on throttled 4G when removed). Do not add one.
- Prose is `.prose-notebook`: 18 px / 1.8 for zh, 19 px / 1.7 for en, body column 42.5 rem.
- `.label` is the instrument lettering: mono, 12 px, lowercase, tabular numerals. Never upper-case it.
- Numbers that change use `tabular` so they do not jitter.
- Page headline: `clamp(2.125rem, 5vw, 3.25rem)`, `text-balance`. Section titles on site pages use
  `SectionHeading` (`§ 01` + a short gradient rule).

### Motion

- Short and functional: page swap 120 ms out / 260 ms in, title morph 340 ms (native View Transitions through
  React `<ViewTransition>`; not framer-motion).
- The page swap is keyed to the pathname (`components/site/page-swap.tsx`, enter/exit). Never hang it on
  `<ViewTransition update>`: a `next/dynamic` component replacing its placeholder is an update too, and replayed
  the whole transition on every load of the home page.
- Disclosures open and close visibly (phone menu, article outline): height by `grid-template-rows 0fr → 1fr`,
  entries staggered in, a quicker exit. An open panel overlays the page; it never pushes the text.
- Everything honours `prefers-reduced-motion`: the global rule in `globals.css` stops CSS animation; a canvas
  loop must check `useReducedMotion()` and draw one still frame instead.
- Animate `transform` and `opacity` only. A loop that paints runs only while it is on screen and the tab is
  visible (`IntersectionObserver` + `visibilitychange`; see `components/site/diffusion-preview.tsx`).

## 3. Layout

- Site container: `mx-auto max-w-7xl px-5 sm:px-8`. Sections on site pages: `border-t border-rule py-12`.
- Article: three columns from 1280 px (TOC 13 rem · body 42.5 rem · margin 17 rem); below that the TOC becomes a
  disclosure and sidenotes become inline toggles.
- Figures and instruments take `size`: `inline` (body column), `wide` (reaches into the margin), `full` (also
  bleeds to the screen edge on a phone).
- Checked at 1440 and 390 wide at minimum. Nothing may scroll sideways except a region built to
  (`.table-scroll`, display maths), and such a region needs `tabIndex={0}` and an accessible name.
- Decorative glows may be wider than the viewport: they are clipped on `<main>` (`overflow-x-clip`), never on the
  content container.

## 4. Components

Available in every `.mdx` without an import (`mdx-components.tsx`):

| Component | Use |
| --- | --- |
| `<Instrument fig="03" title="conv2d" size caption status>` | The frame for **every** interactive. Title is short, lowercase, machine-ish (`diffusion / train`). Brings the error boundary and the no-JS note. |
| `<Figure fig caption size>` | A static picture or diagram. |
| `<Sidenote>` | An aside: margin on desktop, toggle on a phone. For what would break the sentence, not for essentials. |
| `<Callout type="note \| insight \| warn" title>` | Rare. `insight` for the one idea to keep, `warn` for a real pitfall. |

Shared instrument parts in `components/lab`: `Controls` (play / pause / step / reset), `Readout` (label + number +
unit), `Sparkline`, `HeatCanvas`, `CornerMarks`, `useReducedMotion`. UI primitives in `components/ui` are shadcn's
**Base UI** flavour: use the `render` prop, not `asChild`. Use `Slider` from there rather than a bare
`<input type="range">`.

Rules inside an instrument:

- Titles are `<p>`, never headings (an instrument can sit before the article's first `h2`; axe `heading-order`).
- A canvas has an accessible name or is `aria-hidden` with the same information available as text (a `Readout`,
  a caption).
- State the reader produced (a trained model) lives in a small store next to the article (`components/store.ts`)
  so several instruments share it.
- Heavy code (weights, three.js, MuJoCo, a worker) loads with `next/dynamic` or on interaction, behind a
  placeholder **of the same size** — otherwise layout shift comes back. Measure before reaching for a Web Worker;
  it was right for diffusion and wrong for the others.
- A stage whose content depends on colour (coloured point clouds) stays dark in both themes: wrap it in
  `className="dark bg-[#070918]"`.

### A new article also needs

- A cover drawing in `components/site/post-cover.tsx` (`viewBox="0 0 160 100"`, the three signal variables only,
  deterministic — no `Math.random()`; it is hydrated). Until it has one, it gets the generic constellation.
- Optionally a live preview for the "latest" card: a component registered in `components/site/post-previews.tsx`
  **and** `lib/content/previews.ts`. Light enough for the home page: no model, no three.js.

## 5. Interaction and accessibility

Target: WCAG 2.2 AA. Enforced by `e2e/a11y.spec.ts` on every page type, both themes, desktop and phone: axe
(`wcag2a/aa`, `wcag21a/aa`) plus the control checks below. **A new article must be added to the `pages` list in
that file in the commit that publishes it** (not while it is a draft: drafts 404 in the production build).

- **Pressable things show the hand.** A base-layer rule gives `button`, `summary`, `select`, `label[for]`,
  checkboxes, radios, ranges and the ARIA widget roles `cursor: pointer`, and `not-allowed` when disabled. So:
  use a real `<button type="button">` and you get it free. A clickable `<div>` does not, and is not allowed —
  if something truly cannot be a button, give it `role`, `tabIndex`, key handlers and an accessible name.
  Other cursors say something else on purpose: `cursor-crosshair` on a drawing pad, `grab` on a slider thumb,
  text fields keep the I-beam.
- **Targets are at least 24 × 24 CSS px** (SC 2.5.8). Small glyphs get there with padding or a pseudo-element hit
  area (`before:absolute before:-inset-…`; the sidenote marker's `::after` is its number — use `::before`).
  Exempt: links inside a sentence.
- **Everything works from the keyboard**, in reading order, and focus is visible: the global
  `:focus-visible { outline: 2px solid var(--ring) }` must not be removed without a replacement.
- **Every control has a name**: visible text, or `aria-label` for icon buttons and sliders.
- **Colour is never the only signal**: a series has a label or a shape as well; a state has text.
- **Status changes are announced** where they matter (training finished, an error): `role="status"` /
  `aria-live="polite"`, not for values that tick every frame.
- Icons beside text are `aria-hidden`. Decorative SVG and canvases are `aria-hidden`.
- Language: the article body carries `lang`; a run of the other language inside UI gets its own `lang`.
- Touch: a canvas that handles drags sets `touch-none`; nothing depends on hover.

## 6. Content

Structure of an article (`content/posts/<slug>/{zh,en}.mdx`, frontmatter validated by `lib/content/schema.ts`):

1. **Open with the thing itself.** The first instrument comes before the theory, and does one job.
2. **Say early what the demo is not** (memorising vs generating, hindsight vs prediction).
3. Mechanism, one idea per section, each with an instrument or figure that shows it.
4. Failure modes after the mechanism, as a comparison — not a second playground.
5. What differs from the real-world version, references, and how the numbers were measured.

Rules:

- **Length:** at most 10 minutes of reading; 6–8 is the norm.
- **Premise:** fun and obvious in one sentence, with a payoff the reader can play with. A careful negative result
  or a field explainer is not an article here.
- **Titles keep the hook.** Keep the energetic half; if half of a title misleads, fix that half and put the
  honesty in the description. `seoTitle` (≈ 45 en / 24 zh characters) and `seoDescription` (≈ 155 / 80) feed only
  `<title>` and the meta description.
- **Every number is measured and attributed**: live in the reader's browser, "on my machine", or offline with N
  seeds, with the script under `docs/research/`. Twice a number written from reasoning was wrong once measured.
- **A caption describes what the instrument on screen actually does.** Check it against the running page.
- Do not lean on the reveal sentence "沒有人告訴它… / nobody told it…": once per article at most, and only where
  it is the thesis.
- Tables are for data the reader compares, not for prose in columns.
- zh is the source; `en.mdx` is optional but its frontmatter must match (`tests/content/parity.test.ts`). A
  `description:` containing `": "` must be quoted, or the page 500s.
- UI strings live in `lib/i18n/dictionaries/{zh,en}.ts`, never as `locale === "zh" ? … : …` in a component.
  Dictionaries that cross into a client component must not contain functions.
- Tags are lowercase kebab-case; reuse an existing tag before inventing one. The home rail's four stops map to
  `computer-vision`, `llm`, `generative`, `ai-agent`.

## 7. Budgets

Measured on a production build with Lighthouse (mobile preset): accessibility, best practices and SEO 100;
performance ≥ 85 on articles and ≥ 90 on the home page; CLS 0; about 0.5 MB per page before the reader asks for
more. The simulated mobile LCP of 3–4 s is the throttling model (observed ≈ 140 ms), not a target to chase.
One slow run on a busy machine means nothing: run it three times.

## 8. Before publishing

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm e2e && pnpm build
```

- [ ] Looked at in a real browser: 1440 and 390 wide, dark and light, console read once.
- [ ] `draft: true` removed from both files; date set; `no` is the next number.
- [ ] Both pages added to `pages` in `e2e/a11y.spec.ts`; a smoke test for the main instrument in `e2e/smoke.spec.ts`.
- [ ] Cover drawing added to `post-cover.tsx`.
- [ ] Numbers in the text re-read against their source.
- [ ] Merged into `dev`; `main` only through a pull request.

## Motion borrowed from Magic UI (2026-09-20)

Paul asked for a more modern feel with magicui.design as the reference. The patterns are rebuilt in plain CSS and
three tiny client components; **no animation library is installed** (Magic UI's own components need `motion`,
and the site's budget is ~0.5 MB a page). Each one has to say something, as in section 1:

| Pattern (Magic UI name) | Where | What it says | Code |
| --- | --- | --- | --- |
| Border Beam | the hero's live classifier (`<Instrument live>`) | this instrument is running right now | `.border-beam` in globals.css |
| Magic Card spotlight | the latest-article card, post index rows | the thing under your pointer is a door | `.spotlight` + `components/site/spotlight.tsx` (one listener, mouse/pen only) |
| Number Ticker | the three hero readouts | a readout settling; the numbers are counted, not typed | `components/site/number-ticker.tsx` |
| Flickering Grid | the footer's top band | the 3×3 mark continued as a feature map | `components/site/kernel-field.tsx` (one canvas, ~11 fps, paused off screen) |
| Blur Fade | the hero only: title, subtitle, instrument, once on load | one orchestrated moment; nothing else on the site fades in | `.reveal` with `--i` |
| Animated Beam | the rail under the hero | the see → act path carries a signal | `.rail-pulse` (already there) |

Rules: every one of them stands still under `prefers-reduced-motion`; none may move layout (CLS stays 0); do not
add entrance animations to sections or cards, and do not add a second beam, shimmer or glow to the same screen.

### Added the same week

| Pattern | Where | Code |
| --- | --- | --- |
| Bento Grid | the home page's index (`/posts` keeps the ruled list: it is the archive, and a list scans faster) | `components/site/post-bento.tsx`: six columns, newest article 4×2, then 2·2 beside it and rows of 2·2·2 / 3·3; a lone last tile runs full width |
| Drawer motion | the phone menu | the sheet slides in from the edge on `cubic-bezier(0.22, 1, 0.36, 1)` in 420 ms; rows arrive 55 ms apart (`.drawer-row`) |
| Page transition | every client navigation | the old page sinks back and blurs out (180 ms), the new one rises 28 px and sharpens (460 ms); header and footer do not move |
