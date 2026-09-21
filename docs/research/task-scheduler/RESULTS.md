# task-scheduler — measurements

Machine: Apple M4 Pro, node v22.19.0, vitest. Simulation: `content/posts/task-scheduler/components/sim`. Scripts are the
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

- One scheduling pass of a 60-task job takes 7.9 microseconds (4 000 passes timed); the same jobs take 142 simulated minutes on one worker.
- The default job of figure 01 is seed 77: of seeds 1–300 it is the one whose count / work / plan errors and time above 90 % are closest to the 200-job averages (count 11.2 points and 25 % above 90, work 5.8, plan 8.0). In it, the six largest of the 60 tasks are 40 % of the work; the counting bar shows 67 % at half time and crosses 90 % when 76 % of the time has passed.
- Mean job length by workers, 100 jobs with good estimates: 1 → 122.0 min, 2 → 63.1, 4 → 38.4, 8 → 31.4, 16 and beyond → 31.0 (the longest chain).

## Attempts that fail and are scheduled again (`fail-probe.test.ts.txt`, 200 jobs a row, 4 workers)

```
good estimates, fail 0: job 38.1 min, 0.0 failed attempts a job, 0% of worker time wasted | count 10.1 (24%) | work 5.8 (8%) | plan 0.7 (10%) | learn 0.8 (10%)
good estimates, fail 0.1: job 40.9 min, 6.4 failed attempts a job, 6% of worker time wasted | count 10.4 (25%) | work 6.0 (8%) | plan 1.6 (11%) | learn 1.9 (10%)
good estimates, fail 0.2: job 43.9 min, 15.0 failed attempts a job, 13% of worker time wasted | count 10.6 (25%) | work 6.2 (9%) | plan 2.7 (11%) | learn 3.2 (9%)
good estimates, fail 0.3: job 48.6 min, 25.0 failed attempts a job, 20% of worker time wasted | count 10.6 (25%) | work 6.1 (9%) | plan 3.8 (12%) | learn 4.1 (8%)
default (biased) estimates, fail 0: job 45.8 min, 0.0 failed attempts a job, 0% of worker time wasted | count 10.6 (24%) | work 6.7 (10%) | plan 8.2 (14%) | learn 4.0 (11%)
default (biased) estimates, fail 0.1: job 49.0 min, 6.4 failed attempts a job, 6% of worker time wasted | count 10.8 (24%) | work 6.8 (11%) | plan 8.9 (15%) | learn 4.7 (10%)
default (biased) estimates, fail 0.2: job 53.6 min, 15.0 failed attempts a job, 13% of worker time wasted | count 11.4 (25%) | work 7.1 (11%) | plan 9.4 (15%) | learn 5.2 (10%)
default (biased) estimates, fail 0.3: job 58.7 min, 25.0 failed attempts a job, 20% of worker time wasted | count 11.7 (25%) | work 7.3 (11%) | plan 10.0 (17%) | learn 5.6 (9%)
```

- A failed attempt dies 20–100 % of the way through, a task fails at most three times, and the failed task is ready again at once (no back-off). Failures are drawn from a random stream of their own, so a seed gives the same job with or without them; every earlier number in this file is unchanged at a failure rate of 0.
- One attempt in five failing: 15 failed attempts a job, 13 % of worker time wasted, the job 15 % longer (38.1 → 43.9 min with good estimates).
- The forecast bar assumes what is left will go through first time, so it turns optimistic: 0.7 → 2.7 points with good estimates. Counting and weighting by work hardly move (10.1 → 10.6, 5.8 → 6.2): they were wrong already, for other reasons.
- Learning per-kind factors does **not** help here (3.2 against the plan's 2.7 with good estimates): which attempt fails is luck, not a habit of a kind of task, and the learner reads that luck as if it were one. With biased estimates it still halves the error (9.4 → 5.2), because there it is learning the bias.
- The simulation is now 152 lines (it was 131 before failures).
