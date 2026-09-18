# Handoff — main session, 2026-09-18

Written by the outgoing main session for whoever picks this up next. Read this, then the three
memory files under `~/.claude/projects/-Users-paul-jiang-Desktop-Paul/memory/` (they are loaded
automatically, this file is not).

## Where things stand

| | |
| --- | --- |
| Repo | `/Users/paul_jiang/Desktop/Paul/Blog`, GitHub `PSheon/Blog` (public) |
| Branch | `dev` @ `330d96f`. `main` @ `5db09c2` (PR #1 merged by Paul) |
| Production | <https://paul-notebook.vercel.app>, Vercel project `paul-notebook`, deploys `main` |
| Dev server | `pnpm dev` on :3000 was running when this was written |
| Other worktree | `/Users/paul_jiang/Desktop/Paul/Blog-lite3`, branch `feat/lite3` == `dev` (owned by session paul-b9) |
| Tests | 153 unit, 55 E2E (3 skipped: phone-only test on desktop, and two draft articles) — all green at `330d96f` |

Published articles (on `main`): 001 CNN, 002 Flappy Bird, 003 trading agent, 004 Transformer.
Drafts on `dev` only (`draft: true`, excluded from production builds): **005 `hydranet-fruit`**, **006 `lite3-walking`**.

## Waiting on Paul

1. **Review of article 005 (HydraNet).** Full draft in zh + en, three instruments. He said he would
   check the content himself. Remove `draft: true` only when he says so; the E2E test for it then
   stops skipping. Points I asked him to look at: the tone of the "sharing has a price" section, two
   sentences written in his voice ("that is what I do at work", the Karpathy paragraph), title and
   description.
2. **Review of article 006 (Lite3).** Only a spike instrument and a design proposal exist
   (end of `docs/research/2026-09-18-lite3-spike.md`: five panels sharing one simulator). paul-b9 is
   waiting for his OK before building. No prose, no `en.mdx`, no real-phone test yet.
3. **A decision I created:** Paul had told paul-b9 *not to push `feat/lite3` until he confirmed
   everything*. He then asked me to rebase it onto `dev` so he could read it locally. I did that and
   also pushed `dev`, which put the Lite3 commits on `origin/dev`. That push went beyond what he asked.
   I told him and offered to reset `origin/dev` to `c17fe6c` with a lease-guarded force push. **Do not
   do that unless he asks.**

## Rules Paul has set (also in memory)

- Never move or push `main`. Releases are a PR `dev` → `main` that he merges. "Deploy" is not "release".
- Look at every UI change in a real browser before reporting it: desktop 1440/1920, phone 390, both
  themes. Measure (pixels, computed styles, Lighthouse) instead of theorising. He caught me three times.
- Read the dev console once per page.
- Numbers in articles must be measured and attributed (live / on my machine / offline with N seeds).
  Twice a claim I wrote from reasoning was wrong once measured.

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
- Inside an `Instrument`, titles are `<p>`, not headings (axe `heading-order`).
- Scrollable regions (tables, display maths) need `tabIndex={0}` + a name (axe).

## Measured state of the site (production build, Lighthouse)

Home: mobile 93 / 100 / 100 / 100, desktop 100 ×4, CLS 0, ~470 KB. Articles: performance 86–94,
accessibility 100. Simulated mobile LCP is 3–4 s; observed LCP is ~140 ms — it is the throttling
model, not something left to fix cheaply.

## Known gaps, deliberately left

- Windows shows Chinese serif text in PMingLiU (system font trade-off).
- Going *back* has no page transition (React's default for history navigation).
- No custom domain; `lib/site.ts` takes the origin from Vercel until `NEXT_PUBLIC_SITE_URL` is set.
- Article 005: "unseen emoji" and cross-OS domain shift are stated as unmeasured guesses.
- Roadmap after 006: live MNIST training as an upgrade to article 001 (conv backward exists);
  fly-connectome vision model as 007 (licence verified CC-BY; needs a data spike).

## Other sessions

- **paul-d9** — research for 005, finished. Output in `docs/research/2026-09-18-hydranet-article-research.md`.
- **paul-b9** — owns 006 in the `Blog-lite3` worktree. Told to keep working on `feat/lite3`, to ask for
  merges into `dev` instead of pushing `dev`, and that this session is handing over. Peers cannot
  approve anything on Paul's behalf.

## Useful commands

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm e2e && pnpm build
# Lighthouse against a local production build
pnpm build && pnpm start -p 3300 &
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  npx lighthouse http://localhost:3300/zh --quiet --chrome-flags="--headless=new" --output=json --output-path=/tmp/lh.json
```
