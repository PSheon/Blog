# Every article page ships every article's lab code

Found while measuring № 009's bundle (2026-09-20, production build of `feat/city-of-agents`, gzip -9, Turbopack).
Nothing was changed; this is a note for a decision.

## What was measured

`<script src>` tags in the prerendered HTML:

| page | scripts | first-load JS |
| --- | --- | --- |
| `/zh/tags` | — | 203.8 KB |
| `/zh/posts/slam-2d` | 18 | 316.4 KB |
| `/zh/posts/city-of-agents` | 18 | 316.4 KB — the same 18 files |

The 112.9 KB an article page loads on top of the site shell, by whose code is in each chunk:

| chunk | gzip | holds |
| --- | --- | --- |
| `336t47wk33hzy.js` | 38.8 KB | Flappy Bird, Transformer, HydraNet |
| `2byrhsyc3z9_c.js` | 20.3 KB | SLAM |
| `27-mpn35ci7k-.js` | 18.1 KB | city-of-agents |
| `30twlcw3su-k-.js` | 15.7 KB | diffusion |
| `1a3iv3riv8erl.js` | 10.9 KB | Lite3 |
| `328_ej7barqbz.js` | 9.1 KB | shared |

So the SLAM page needs about 29 KB of this and downloads and parses 113 KB; every new article adds its labs to every
other article's page. (Heavy things — three.js, MuJoCo, weights — are not affected: they are imported on interaction.)

## Why

`app/[locale]/posts/[slug]/page.tsx` loads the article with ``import(`@/content/posts/${slug}/${locale}.mdx`)``. A
template-literal import is a context over every post, the route is one entry, and the client components reachable from
that entry are emitted as the entry's scripts — all of them, whichever post is rendered.

## What does not fix it

Tried on № 009 only: exporting the labs from `components/index.ts` through `next/dynamic`. The article's code still
appeared as `<script>` tags on the SLAM page (it only moved into differently named chunks: 46.8 KB + 15.2 KB).

## What probably would (not tried)

1. Keep each lab's `"use client"` file a thin shell (canvas, controls, placeholder) and move the model / simulation /
   drawing code behind an `import()` made when the figure comes on screen — the pattern the 3-D scenes already use for
   three.js. The shells stay in the shared scripts but are small. Per article, no routing change.
2. Give articles their own route entries (a generated `app/[locale]/posts/<slug>/page.tsx` per post, or a route group
   per post), so each entry's client graph is its own. Larger change; touches sitemap, feeds, OG images, static params.

Measure before choosing: option 1 on the two largest (Flappy/Transformer/HydraNet chunk, SLAM) would show how much of the
113 KB is shell and how much is movable.
