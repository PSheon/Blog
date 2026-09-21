# progress-bar — measurements

Machine: Apple M4 Pro, node v22.19.0, vitest. Simulation: `content/posts/progress-bar/components/sim`. Scripts are the
`.test.ts.txt` files here; each says how to run it. `proto.mjs.txt` is the throwaway that came before the proposal.

## How honest is each bar? (`honesty-probe.test.ts.txt`, 200 jobs a row, seeds 1–200)

A job is 60 tasks in 6 layers, each waiting for one or two tasks of the layer before. "pts" is the mean distance between
what the bar shows and the share of time that has really passed, in points of 100. "above 90" is the share of the run the
bar spent at 90 % or more (honest: 10 %). "back" is the largest step backwards, in points.

```
even, unbiased, 4w       count: 2.1 pts, 11% above 90, back 0.0 | work: 2.2 pts, 10% above 90, back 0.0 | plan: 0.2 pts, 11% above 90, back 0.0 | learn: 0.3 pts, 11% above 90, back 0.0 [1.7 ms/run]
skewed, unbiased, 4w     count: 10.1 pts, 24% above 90, back 0.0 | work: 5.8 pts, 8% above 90, back 0.0 | plan: 0.7 pts, 10% above 90, back 1.6 | learn: 0.8 pts, 10% above 90, back 1.6 [1.6 ms/run]
skewed, unbiased, 16w    count: 17.4 pts, 33% above 90, back 0.0 | work: 7.9 pts, 11% above 90, back 0.0 | plan: 0.9 pts, 10% above 90, back 2.3 | learn: 1.0 pts, 10% above 90, back 2.3 [1.7 ms/run]
default (biased), 4w     count: 10.6 pts, 24% above 90, back 0.0 | work: 6.7 pts, 10% above 90, back 0.0 | plan: 8.2 pts, 14% above 90, back 1.6 | learn: 4.0 pts, 11% above 90, back 2.8 [1.6 ms/run]
default (biased), 16w    count: 17.9 pts, 31% above 90, back 0.0 | work: 9.4 pts, 13% above 90, back 0.0 | plan: 9.6 pts, 15% above 90, back 2.3 | learn: 4.8 pts, 11% above 90, back 3.5 [1.8 ms/run]
```

- **Counting tasks** is off by 10 points with 4 workers and 17 with 16, and sits above 90 % for a quarter to a third of
  the run. Even task sizes make it fine (2.1): the lie comes from a few big tasks, and from the tail of the job running
  on one worker while the head ran on all of them.
- **Weighting by estimated work** halves that (5.8, 7.9) and cannot do better even with perfect estimates: work done is
  not time passed when the number of busy workers changes during the run.
- **Replaying the plan** — what is left, scheduled on these workers, with the estimates — is nearly exact when the
  estimates are good (0.7–0.9) and **worse than weighting by work when they are biased by kind** (8.2 against 6.7 with 4
  workers). A better model fed wrong numbers loses to a cruder one.
- **Learning each kind's factor from the tasks that have finished** halves the plan bar's error (8.2 → 4.0, 9.6 → 4.8).
  What is left is luck per task, which nothing can learn, and the early part of the run, when nothing has finished yet.
- The two forecasting bars step **backwards** by 2–3 points when a task outruns its estimate. Counting and weighting never
  do. A real progress bar usually hides this by never moving back, which is one more way of not telling the truth.
- One run costs 1.7 ms (four bars × 101 samples, each forecast re-scheduling what is left), so a figure can work out a few
  hundred runs while the reader watches.
