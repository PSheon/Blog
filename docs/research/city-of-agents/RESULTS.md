# city-of-agents — measurements

Machine: Apple M4 Pro, macOS 26.6.2, node v22.19.0, vitest 5. Simulation code as of the commit that adds this file (stage 1, on top of `8542d61`).
Everything here is headless: `content/posts/city-of-agents/components/sim` only, no three.js, no rendering.
The scripts are the `.test.ts.txt` files in this folder; each says how to run it in its first lines.
Browser frame time is not recorded here on purpose: the instrument measures it live.

## 1. Cost of one tick (`bench.test.ts.txt`)

One tick = one simulated minute = needs + due decisions + 6 movement sub-steps. 120 warm-up ticks, then one simulated day
(1440 ticks), seed 1, utility mode. At 1× the page runs 10 ticks per real second, at 20× 200.

```
┌─────────┬────┬────────┬───────────┬──────────┬──────────────┬─────────────┬─────────────┬────────────┬────────────────┐
│ (index) │ N  │ agents │ nav nodes │ build ms │ tick mean ms │ tick p95 ms │ tick max ms │ events/day │ path cache hit │
├─────────┼────┼────────┼───────────┼──────────┼──────────────┼─────────────┼─────────────┼────────────┼────────────────┤
│ 0       │ 4  │ 50     │ 153       │ '1.3'    │ '0.036'      │ '0.060'     │ '1.19'      │ 1922       │ '89%'          │
│ 1       │ 4  │ 100    │ 153       │ '0.2'    │ '0.037'      │ '0.050'     │ '0.45'      │ 3841       │ '91%'          │
│ 2       │ 4  │ 300    │ 153       │ '0.3'    │ '0.063'      │ '0.085'     │ '0.47'      │ 11538      │ '95%'          │
│ 3       │ 4  │ 1000   │ 153       │ '1.0'    │ '0.179'      │ '0.267'     │ '0.44'      │ 38496      │ '98%'          │
│ 4       │ 8  │ 50     │ 639       │ '0.4'    │ '0.034'      │ '0.062'     │ '0.75'      │ 1881       │ '80%'          │
│ 5       │ 8  │ 100    │ 639       │ '0.4'    │ '0.048'      │ '0.086'     │ '0.97'      │ 3717       │ '82%'          │
│ 6       │ 8  │ 300    │ 639       │ '0.6'    │ '0.095'      │ '0.170'     │ '0.73'      │ 11397      │ '88%'          │
│ 7       │ 8  │ 1000   │ 639       │ '0.8'    │ '0.268'      │ '0.468'     │ '0.82'      │ 38029      │ '92%'          │
│ 8       │ 16 │ 50     │ 2475      │ '1.2'    │ '0.043'      │ '0.104'     │ '0.75'      │ 1871       │ '72%'          │
│ 9       │ 16 │ 100    │ 2475      │ '3.8'    │ '0.070'      │ '0.175'     │ '0.85'      │ 3717       │ '74%'          │
│ 10      │ 16 │ 300    │ 2475      │ '0.7'    │ '0.169'      │ '0.411'     │ '0.95'      │ 11242      │ '78%'          │
│ 11      │ 16 │ 1000   │ 2475      │ '1.1'    │ '0.515'      │ '1.104'     │ '2.33'      │ 37474      │ '81%'          │
└─────────┴────┴────────┴───────────┴──────────┴──────────────┴─────────────┴─────────────┴────────────┴────────────────┘
```

- 300 people, N = 8: 0.095 ms per tick, so about 1 ms per real second at 1× and about 19 ms per real second (0.3 ms per
  60 Hz frame) at 20×.
- Two things were found by this bench and fixed before these numbers: the spatial hash had one cell per separation radius
  (200 000 cells at N = 16, walked six times a tick; now at most 64 × 64), and choosing the nearest restaurants sorted
  every restaurant in the city. Before: 0.46 ms (N = 8, 300) and 1.19 ms (N = 16, 300) per tick.
- A day of 300 people is about 11 400 events, so the 5000-event record holds roughly ten simulated hours.

## 2. The need rates (`params-probe.test.ts.txt`, `hourly-profile.test.ts.txt`)

300 people, N = 8, seed 1. Shares are of person-minutes on the last full day; "pinned" is the share of person-minutes a
need (fatigue / hunger / social / duty) sat at 1.0; "peak10" is the busiest ten minutes of departures as a share of the
population; "modal" is the mean share of people doing the most common thing.

```
│ (index) │ label                       │ sleep │ eat   │ social │ work  │ traveling │ idle  │ pinned            │ events/agent/day │ trips/agent/day │ peak10 │ modal  │ work start p10/50/90 │ trips │ arrived │
├─────────┼─────────────────────────────┼───────┼───────┼────────┼───────┼───────────┼───────┼───────────────────┼──────────────────┼─────────────────┼────────┼────────┼──────────────────────┼───────┼─────────┤
│ 0       │ 'first draft (SPEC_PARAMS)' │ '28%' │ '23%' │ '18%'  │ '13%' │ '19%'     │ '0%'  │ '30% 25% 29% 32%' │ '52.2'           │ '13.1'          │ '14%'  │ '0.33' │ '10.2/14.1/19.8'     │ 17784 │ 17725   │
│ 1       │ 'first draft, duty off'     │ '35%' │ '24%' │ '23%'  │ '0%'  │ '17%'     │ '0%'  │ '12% 20% 7% 0%'   │ '49.0'           │ '12.2'          │ '14%'  │ '0.35' │ '-/-/-'              │ 16106 │ 16055   │
│ 2       │ 'proposed (PARAMS)'         │ '33%' │ '8%'  │ '12%'  │ '25%' │ '10%'     │ '11%' │ '0% 0% 0% 0%'     │ '38.2'           │ '9.2'           │ '11%'  │ '0.53' │ '8.2/12.1/17.8'      │ 12774 │ 12741   │
│ 3       │ 'proposed, duty off'        │ '33%' │ '8%'  │ '13%'  │ '0%'  │ '6%'      │ '40%' │ '0% 0% 0% 0%'     │ '28.4'           │ '6.2'           │ '8%'   │ '0.56' │ '-/-/-'              │ 8754  │ 8735    │
│ 4       │ 'proposed, no body clock'   │ '33%' │ '8%'  │ '12%'  │ '24%' │ '13%'     │ '9%'  │ '1% 1% 1% 1%'     │ '43.0'           │ '10.4'          │ '11%'  │ '0.43' │ '5.2/11.3/19.3'      │ 14649 │ 14621   │
│ 5       │ 'fsm'                       │ '57%' │ '4%'  │ '0%'   │ '35%' │ '4%'      │ '0%'  │ '0% 53% 100% 0%'  │ '16.0'           │ '4.0'           │ '100%' │ '0.99' │ '8.3/8.9/13.1'       │ 6000  │ 6000    │
│ 6       │ 'random'                    │ '46%' │ '18%' │ '2%'   │ '5%'  │ '13%'     │ '17%' │ '1% 11% 87% 73%'  │ '35.7'           │ '7.8'           │ '9%'   │ '0.46' │ '2.6/11.9/22.1'      │ 11167 │ 10925   │
└─────────┴─────────────────────────────┴───────┴───────┴────────┴───────┴───────────┴───────┴───────────────────┴──────────────────┴─────────────────┴────────┴────────┴──────────────────────┴───────┴─────────┘
 Test Files  2 passed (2)
      Tests  2 passed (2)
```

**The first draft of the table does not give a day.** Relieving its four needs takes 24·0.06/0.15 + 24·0.12/0.4 + 24·0.05/0.2 +
10·0.15/0.25 = 28.8 hours out of every 24, before any walking. Measured: nobody is ever idle, each need is pinned at 1
for a quarter to a third of the time, 13 trips a day, and the median start of work is 14:06 because duty only passes 0.5
at 11:20. Nothing ties sleep to the night either: by two-hour slot the share asleep only moves between 16 % and 37 %.

**Proposed rates (now `PARAMS`; the first draft is kept as `SPEC_PARAMS`).** Waiting for Paul's OK — the article quotes these.

| | first draft | proposed | why |
| --- | --- | --- | --- |
| hunger growth /h | 0.12 | 0.075 | 0.6 every eight hours: three meals, not five |
| recovery /h (sleep, eat, social, work) | 0.15, 0.4, 0.2, 0.25 | 0.18, 0.9, 0.4, 0.25 | 8 h sleep, 40-minute meals, 3 h of company |
| duty hours, threshold | 08–18, 0.5 | 06–16, 0.4 | from zero, duty passes the threshold between 08:13 and 09:20 depending on the person (arithmetic: 0.4 / (0.15 ± 20 %)), instead of 11:20; measured, work fills up over 08–10 (table below) |
| body clock | — | fatigue grows × (1 − 0.9 · sunAltitude) | sleep happens at night; reuses the one sky function |
| walking speed | — | 9 units per minute | the 8 × 8 city is about 40 minutes across: walking is visible at 10 sim-minutes per second, and the distance term (0.1 per hour walked) is comparable to differences in need² |
| hysteresis, stay bonus, decision phase | — | done at 0.05, +0.3, own phase | without them a meal lasts one reconsideration and everyone decides on the same minute |

By two-hour slot (share of people, %; last two of six days):

```
first draft (SPEC_PARAMS)
┌─────────┬─────────┬───────┬─────┬────────┬──────┬───────────┬──────┐
│ (index) │ hour    │ sleep │ eat │ social │ work │ traveling │ idle │
├─────────┼─────────┼───────┼─────┼────────┼──────┼───────────┼──────┤
│ 0       │ '0-2'   │ 36    │ 23  │ 20     │ 2    │ 19        │ 0    │
│ 1       │ '2-4'   │ 30    │ 23  │ 26     │ 1    │ 20        │ 0    │
│ 2       │ '4-6'   │ 34    │ 23  │ 22     │ 1    │ 19        │ 0    │
│ 3       │ '6-8'   │ 37    │ 23  │ 22     │ 0    │ 18        │ 0    │
│ 4       │ '8-10'  │ 33    │ 23  │ 22     │ 2    │ 19        │ 0    │
│ 5       │ '10-12' │ 27    │ 19  │ 12     │ 25   │ 17        │ 0    │
│ 6       │ '12-14' │ 16    │ 26  │ 7      │ 35   │ 16        │ 0    │
│ 7       │ '14-16' │ 19    │ 22  │ 11     │ 32   │ 15        │ 0    │
│ 8       │ '16-18' │ 20    │ 24  │ 13     │ 27   │ 15        │ 0    │
│ 9       │ '18-20' │ 21    │ 23  │ 16     │ 17   │ 22        │ 0    │
│ 10      │ '20-22' │ 30    │ 20  │ 22     │ 8    │ 20        │ 0    │
│ 11      │ '22-24' │ 32    │ 21  │ 19     │ 4    │ 24        │ 0    │
└─────────┴─────────┴───────┴─────┴────────┴──────┴───────────┴──────┘
proposed, no body clock
┌─────────┬─────────┬───────┬─────┬────────┬──────┬───────────┬──────┐
│ (index) │ hour    │ sleep │ eat │ social │ work │ traveling │ idle │
├─────────┼─────────┼───────┼─────┼────────┼──────┼───────────┼──────┤
│ 0       │ '0-2'   │ 39    │ 10  │ 17     │ 8    │ 12        │ 14   │
│ 1       │ '2-4'   │ 37    │ 8   │ 16     │ 9    │ 11        │ 19   │
│ 2       │ '4-6'   │ 37    │ 9   │ 14     │ 6    │ 10        │ 24   │
│ 3       │ '6-8'   │ 37    │ 8   │ 11     │ 15   │ 13        │ 16   │
│ 4       │ '8-10'  │ 26    │ 7   │ 7      │ 43   │ 14        │ 3    │
│ 5       │ '10-12' │ 19    │ 4   │ 7      │ 56   │ 13        │ 1    │
│ 6       │ '12-14' │ 21    │ 5   │ 8      │ 52   │ 11        │ 2    │
│ 7       │ '14-16' │ 20    │ 8   │ 9      │ 48   │ 14        │ 2    │
│ 8       │ '16-18' │ 31    │ 10  │ 9      │ 32   │ 16        │ 2    │
│ 9       │ '18-20' │ 44    │ 10  │ 14     │ 11   │ 16        │ 5    │
│ 10      │ '20-22' │ 45    │ 10  │ 19     │ 7    │ 14        │ 6    │
│ 11      │ '22-24' │ 42    │ 11  │ 19     │ 7    │ 13        │ 8    │
└─────────┴─────────┴───────┴─────┴────────┴──────┴───────────┴──────┘
proposed (PARAMS)
┌─────────┬─────────┬───────┬─────┬────────┬──────┬───────────┬──────┐
│ (index) │ hour    │ sleep │ eat │ social │ work │ traveling │ idle │
├─────────┼─────────┼───────┼─────┼────────┼──────┼───────────┼──────┤
│ 0       │ '0-2'   │ 65    │ 8   │ 13     │ 1    │ 8         │ 5    │
│ 1       │ '2-4'   │ 59    │ 11  │ 12     │ 1    │ 8         │ 8    │
│ 2       │ '4-6'   │ 54    │ 12  │ 13     │ 1    │ 8         │ 13   │
│ 3       │ '6-8'   │ 45    │ 9   │ 13     │ 5    │ 10        │ 18   │
│ 4       │ '8-10'  │ 23    │ 7   │ 14     │ 35   │ 17        │ 4    │
│ 5       │ '10-12' │ 6     │ 3   │ 10     │ 69   │ 12        │ 1    │
│ 6       │ '12-14' │ 2     │ 8   │ 13     │ 63   │ 9         │ 4    │
│ 7       │ '14-16' │ 2     │ 11  │ 11     │ 61   │ 9         │ 6    │
│ 8       │ '16-18' │ 9     │ 13  │ 12     │ 43   │ 11        │ 12   │
│ 9       │ '18-20' │ 23    │ 8   │ 17     │ 14   │ 12        │ 27   │
│ 10      │ '20-22' │ 48    │ 4   │ 11     │ 3    │ 12        │ 22   │
│ 11      │ '22-24' │ 65    │ 6   │ 9      │ 1    │ 10        │ 9    │
└─────────┴─────────┴───────┴─────┴────────┴──────┴───────────┴──────┘
```

With the proposed rates two thirds of the city is asleep at 01:00, two thirds is at work at 11:00, walking peaks at
08–10, and about 11 % of the day is free. Switching duty off frees 40 % of the day. The fixed timetable sends 100 % of
people out in the same ten minutes; utility 11 %; random 9 %. The "modal" read-out separates the modes less clearly
(0.99 / 0.53 / 0.46) because at night most people are asleep in every mode — departures are the better synchrony measure.

## 3. three.js: shared chunk or named imports (stage 2)

Production build (`pnpm build`, draft flag removed locally and not committed), gzip -9 of the emitted chunks.

| how the scene gets three.js | chunks containing the renderer | gzip |
| --- | --- | --- |
| `import("three")`, the whole namespace, as SLAM and Lite3 do | `1uew_oe3lwo7a.js` + `35_-pqd2crq59.js` — the same two files those articles already load | 88.1 KB + 100.2 KB = 188.3 KB |
| a module re-exporting only the 23 names the scene uses | `13ffalr2qqay4.js` (new) + `35_-pqd2crq59.js` | 84.7 KB + 100.2 KB = 184.9 KB |

Named imports save 3.4 KB and cost a reader who has already opened SLAM or Lite3 a second 85 KB download, because the
renderer pulls in most of the library whatever is named. The scene keeps the shared namespace import.
None of the JavaScript the article's HTML references on first load contains three.js (checked by searching every
referenced chunk for `WebGLShadowMap`): it is fetched when the figure first comes on screen.

The city scene without people is 7 draw calls a frame including the shadow pass (read from `renderer.info` in the page).
three r186 has removed `PCFSoftShadowMap` (asking for it logs a warning and falls back); `PCFShadowMap` is now the soft one.
