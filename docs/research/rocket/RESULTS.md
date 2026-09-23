# Rocket landing — lab notebook

Question: can a reader fly a Falcon 9 first stage down by hand, fail, and then watch a policy learn the landing burn
in the page? Everything here ran in node with the blog's own `lib/ml`, on an M4 Pro. Scripts live outside git in
`Desktop/Paul/rocket-work/` (`sim.ts`, `probe.ts`, `train.ts`, `cem.ts`, `params.ts`, `vertical.ts`).

## The physical fact the article is built on (2026-09-23)

From the published numbers:

| | | source |
| --- | --- | --- |
| Merlin 1D, one engine | 845 kN, throttles down to 482 kN (57 %) | Wikipedia, Falcon 9 Block 5 |
| First stage, empty | 22,200 kg | same |
| Restart | "only 3 engines for boostback/reentry/landing burns" | same |
| Isp, sea level | 282 s | Wikipedia, Merlin engine family |

A stage at touchdown weighs roughly 25 t, which is 245 kN of weight. **One engine at its lowest throttle pushes
482 kN — about twice that.** So the stage cannot hover, hover-and-descend, or hold any speed at all: the engine is
either off, or it is slowing the stage down hard. The only way down is to fall, then burn once, timed so that height
and speed reach zero together. That is the whole article in one paragraph, and the reader discovers it the first time
they try to "ease it down" and get thrown back up.

## The simulator (`sim.ts`)

Two dimensions, 0.1 s steps: position, velocity, tilt, spin, fuel. One engine (845 kN, floor 482 kN, ±5° gimbal),
Isp 282 s, a 47 m tube rotating about its middle. Air is not optional at these speeds: drag with ρ 1.1, Cd 1.0,
A 10.8 m² gives an empty stage a terminal velocity of **191 m/s**, which is why the descent arrives at roughly the
speed it does. Grid fins get a torque proportional to v², so they are strong while it is fast and useless when it is
slow — the engine has to do the last part. The stage also weathercocks into the airflow (a drag-alignment torque),
without which a tube tumbles and nothing is controllable.

Deliberately not modelled: the boostback and entry burns (the article is only the landing burn), three-engine
braking, wind, legs, the pad's motion at sea. The start is 2,400–2,800 m up, 200–240 m/s down, ±150 m off centre,
8–9 t of fuel. A landing counts as within 26 m of centre (a droneship deck is ~52 m across), under 6 m/s, under 10°.

## What the sim's numbers should look like

Hand-written pilot (`probe.ts`, bang-bang around a speed profile, PD on the gimbal), 200 descents:
**81–92 % landed** depending on how late it waits (the `MARGIN` constant), touchdown 2.7 m/s, miss 11 m, burn 14–15 s,
3.8–4.1 t of fuel left. A real landing burn is of that order, which is the sanity check that matters.

An early version of the same pilot tried to *hold* a descent speed by throttling between 57 % and 100 %. It ran the
tanks dry every time, for the reason above: below the profile the engine still pushes up, so the only way to keep a
speed is to pulse. Bang-bang is not a simplification here, it is the answer.

## Learning it (the part that is not solved yet)

| what learns | inputs → outputs | result |
| --- | --- | --- |
| Neuroevolution (`Population`, 120 weights) | 7 → 12 → 3 | 300 generations, **0 % landed**; score never leaves the "never fire the engine" plateau |
| CEM on the same network | same | 60 iterations, **0 % landed** |
| CEM on the same network, shaped reward | same | learns to fire, then tips over or stops in mid-air |
| CEM on five constants of the hand-written shape (`params.ts`) | margin, flare speed, two steering gains, gimbal stiffness | **100 % of 200 descents after 5 iterations (0.1 s)**, touchdown 1.0 m/s, miss 0 m, 1.9 t left |

The last row is the one that would work in a page today, and it is honest: what is being learned is five numbers, not
a controller from nothing. The network version is the more interesting story, and it is currently a failure I can
explain rather than a result.

### Three ways the reward lied, all measured

1. **Do nothing.** With a plain terminal reward (close to the pad, slow, upright, big bonus for landing), both
   optimisers settled at a score of ~180 by never firing the engine at all. Falling gives a decent "close to the pad,
   upright" score; burning early throws the stage away and scores worse. The landing bonus is never seen, so nothing
   pulls the search out. The hand-written pilot scores 628 under the same reward, so the reward was not the problem —
   the search never found the one narrow path to it.
2. **Die early.** Adding a per-step penalty for being off the speed profile made it *worse*: ending the episode stops
   the penalty, so tipping over immediately was the best move available. Every episode ended "lost" within 14 s.
   Per-step rewards have to be positive, or the exit is a reward.
3. **Stop in mid-air.** With a positive per-step reward and a terminal bonus for a slow ending, the vertical-only
   version learned to kill its speed high up and hang there until the tanks ran dry: impact speed 1.0 m/s, outcome
   "out of fuel", 99 times out of 100. The bonus asked for a slow ending, not for a landing. Requiring the slow ending
   to happen near the ground flipped it straight to the other failure: never burn, arrive at 224 m/s.

That is the same lesson as article 014's judge, in a setting where the reader can see it in one picture: **what you
reward is what you get, and the gap between "what I meant" and "what I wrote" is where the policy lives.**

## Open

- Make the network version work: warm-start from the five-number controller (imitation), or reward the *difference*
  from the profile on a curve that cannot be gamed by ending early or hanging in the air. Worth one more day.
- The reader flying it by hand: keyboard throttle and gimbal, which is where the "it cannot hover" lesson lands.
- Three engines for the first part of the burn, as the real stage does.
- A 3D view. Geometry decision below.

## The 3D model question

- **Recommendation: build the stage from primitives**, the way the SLAM and city articles build theirs — a 3.7 × 47 m
  cylinder, four legs, four grid fins, a nozzle and a flame. It costs nothing to ship, needs no licence, matches the
  house style, and the article is about the physics, not the panel lines.
- If a real model is wanted: Sketchfab has Falcon 9 models under **CC BY** (attribution, commercial use allowed), e.g.
  "Falcon 9 SpaceX rocket" by artemycz and Forest Katsch's Block 5 grid fin. Each would need its licence checked on
  the page itself, credited in the README and the article, and the textures stripped as the light series' assets were.
- SpaceX publishes no official model, and "Falcon 9" and "Starship" are SpaceX trademarks: the article should describe
  the vehicle rather than imply any endorsement.
- Starship instead of Falcon 9 is the more spectacular manoeuvre (belly-flop, then a flip to vertical) and its numbers
  are public too (~100 t dry, Raptor 2 at 2.3 MN, 327 s). It is also a harder control problem and a bigger build: the
  flip needs an aerodynamic model of four flaps. Falcon 9 first, Starship as a possible second article.

## The model (2026-09-23)

Paul downloaded "Spacex Starship Ship 24 & Booster 7 V4" by clarence365 (Sketchfab, **CC BY 4.0**, commercial use
allowed, attribution required). 37 MB, 871,000 triangles, 291 meshes, and the scene holds the launch tower and the
pad as well as the rocket.

The pipeline that worked (`scripts/rocket/pack-starship.mjs`, and the commands in its header):

1. Read the original glTF, apply every node's transform.
2. **Find the rocket by its own axis**, not by height: map the ground plane, take the tallest column of geometry, and
   keep what stands within a rocket's radius of that line. A height cut alone keeps the top of the launch tower.
3. Keep what is above the interstage (the top half), write it back out as a glb.
4. `weld` and `simplify` that alone (ratio 0.09, error 0.002): 195,756 → 19,335 triangles.
5. Pack: quantised positions (int16), normals (int8), u32 indices, one byte of paint per triangle.
   **342 KB, 125 KB gzipped** — the light series ships about 850 KB of models, so this is in budget.

Two bugs worth remembering, both found by measuring rather than looking:

- **Interleaved attributes.** Sketchfab's export packs POSITION and NORMAL into one buffer view with a byteStride.
  Reading it as if it were tight scrambles every vertex: 73,000 of 84,000 triangles came out with edges longer than
  8 m, some as long as the whole ship (49.9 m). The check that caught it was counting long edges, not looking at the
  render — on screen it was "some dark spiky mess", which says nothing about the cause.
- **Simplify before extracting is wrong.** The rocket shares meshes with the tower, so simplifying the scene first
  tears the rocket apart. Extract, then simplify.

A sanity check that costs nothing: a Starship is a 9 m tube, so the mean radius about its own axis should sit near
4.5 m and taper at the nose. The packer prints that profile; the finished model reads 4.1, 3.2, 3.4, 4.3, 3.8, 3.3,
3.0, 3.0, 3.9, 1.7 m from the engines up.

## Switched to Starship (2026-09-23)

Paul's model is Ship 24, so the article's vehicle changed and the physics with it. Published numbers:

| | | source |
| --- | --- | --- |
| Raptor 2, sea level | 2,256 kN, throttles 40–100 %, Isp 327 s | Wikipedia, SpaceX Raptor |
| Ship, dry | about 100 t (Block 1) | Wikipedia, SpaceX Starship |
| Ship | 50.3 m long, 9 m across | same |
| Landing | at about 500 m it lights engines, folds the rear flaps in, swings to vertical | SpaceX's flight profile |

**The engine count, which Paul asked about:** the 33 engines are the BOOSTER's. The ship has six — three sea-level
Raptors and three vacuum ones — and lands on two or three of the sea-level three. The figure lets the reader pick:

| engines | full thrust | lowest thrust | weight at landing | TWR at the floor | trained landing rate |
| --- | --- | --- | --- | --- | --- |
| 2 | 4.51 MN | 1.80 MN | 1.26 MN | 1.44 | **200 of 200**, touchdown 1.25 m/s, 3.4 m off |
| 3 | 6.77 MN | 2.71 MN | 1.26 MN | 2.16 | 147 of 200, touchdown 2.6 m/s, 11 m off |

**More engines make it harder.** The floor is 40 % of whatever is lit, so a third engine pushes the lowest possible
thrust from 1.4× the ship's weight to 2.2×, and the window to arrive at zero narrows. Same trainer, same budget.

> **Superseded** by "Letting it choose how many engines to light" below. Those two rates were measured with the
> bang-bang landing law and a fixed engine count; the law now asks for a thrust and picks the count itself, and the
> numbers in this table should not be quoted.

Two more things the simulator taught me, both of which explain the real flight profile:

- **Flat beats pointy by a factor of three.** Broadside the ship shows 450 m² instead of 64, so terminal velocity is
  **66 m/s** on its belly against **177 m/s** nose-first. The flaps only bite while the air is moving, which is why
  the engines have to finish the job.
- **The flip throws the ship sideways.** Lit while still horizontal, the engines point sideways, and by the time it
  is upright it has moved 100–200 m. My first version fell straight at the pad and no amount of training got above
  0 %: the manoeuvre itself carried it off. Starting 150–270 m to one side — which is what the real profile does —
  took the same trainer to 100 % in ten rounds.

Trained in the page by CEM over seven constants: ignition height (it finds ~600 m, against the real ~500 m), swing
gain, braking margin, touchdown speed, attitude stiffness, sideways correction, flip throttle.

## Is there a neural network in it? (2026-09-23)

There is now, and it is the honest comparison the article needs. All of this is Starship, two engines.

| what flies | how it was made | landings out of 200 |
| --- | --- | --- |
| Seven constants, searched by CEM | 20 rounds, about a second in the page | **200** — touchdown 1.25 m/s, 3.4 m off |
| A network (8 → 24 → 4), copying that controller | behaviour cloning, 6,000 steps, loss 0.064 | **0** |
| The same network, after DAgger | 6 rounds, 327,000 labelled states, 4 s | **108** (plus 73 that never finished, 5 crashes, 14 dry) |

- **Cloning fits and still cannot fly.** The loss says it has learned the teacher's answers (gate 0.69 → 0.064); the
  landing rate says nothing transferred. Small errors take it to states the teacher's own flights never visited, and
  there it has no idea. Article 013 hit exactly this wall.
- **DAgger is what fixes it**: fly the *student*, ask the teacher what it would have done at each state the student
  reached, add those labels, retrain. 0 % → 54 % over six rounds in four seconds.
- **Two mistakes of mine, both worth keeping in the article**:
  1. My first network could only say "fire" or "don't". The teacher flips at 40 % and brakes at 100 %, so the student
     was being asked to copy something it could not express. Adding a second output for *how hard* dropped the gate
     loss from 0.36 to 0.06.
  2. Firing is a minority of the flight, and with random batches the student learned the safest answer: never fire.
     Half the batch now comes from lit steps.
- **The network still loses to seven numbers**, and that is the article's point rather than an embarrassment: when the
  shape of the answer is known (fall, flip, brake, arrive at nothing), fitting a few constants beats learning the
  whole map from scratch — and the reader can watch both fly the same descent.

### It is not reliable, and that is the finding (3 seeds)

| seed | after cloning | after 6 DAgger rounds |
| --- | --- | --- |
| 11 | 0 % | 54 % |
| 23 | 20 % | **10 %** — DAgger made it worse |
| 37 | 0.5 % | 57 % |

So the honest sentence is not "cloning fails and DAgger fixes it". It is: **cloning lands 0–20 % depending on where
the weights start, DAgger usually helps a lot and sometimes hurts, and neither comes near the seven numbers, which
land 200 of 200 every time.** A third of the network's flights never finish at all — it hovers near the deck and
runs the tanks dry instead of committing.

In the page the whole lesson takes **5 seconds** in Chromium (about 6 in node), and the reader watches the stages go
past: copying → DAgger 1…6, with the landing rate beside each. One run there went 0 % → 18 % → 10 %, which is within
this spread.

### Round two: more DAgger, a low-altitude pool, and a smoother teacher (5 seeds each)

Three changes, measured in order, 200 descents per seed:

1. **12 DAgger rounds instead of 6, 4,000 training steps instead of 2,500, and a third of every batch drawn from
   below 150 m** (where the teacher pulses the engines and where the student hovers): 73.5, 47, 82, 68.5, 33.5 %.
   Mean 61 %, against 54, 10, 57 before. Better, still a wide spread.
2. **A smoother teacher.** Under 60 m the autopilot's target speed used to snap to one number, which makes its
   decision a knife edge; a student copying a knife edge oscillates. Letting the target shrink as `0.55·√(y−4)`
   keeps the autopilot at 200 of 200 (retrained: ignite 644 m, swing 2.55, margin 0.65, flare 1.4) and makes the
   labels learnable in principle. The students: **95.5, 0, 41, 41, 2 %**.

That second row is the honest result of the day. One seed became the best network yet, two collapsed into hovering
(171 of 200 flights simply never finished), and the mean barely moved. The lesson is not "smooth your teacher" — it
is that behaviour cloning a bang-bang controller is brittle, and which side of that brittleness a run lands on is
decided by the initial weights.

What the article should say, with these numbers in it: seven constants land 200 of 200 every time, and a network
taught by the same controller lands anywhere between none and 191 of 200 depending on where its weights started.

Three-engine autopilot, retrained against the smoother shape: 176 of 200 (touchdown 2.4 m/s, 10 m off), gains
552 m / 1.42 / 0.40 / 2.72 / 2.02 / 0.51 / 0.40.

Open: the hovering is the thing to fix, and it is not a reward problem (there is no reward here — it is supervised).
Either the student needs to see more of the moment the teacher cuts the engine, or the teacher needs a shape whose
decision boundary is further from where the student spends its time.


## Letting it choose how many engines to light (2026-09-23)

Paul's question: the engine count should be the model's decision, not a setting. Chasing it turned up a bug, a
rewrite of the landing law, and a much better result.

### The bug: the count was never actually learned

The first attempt gave `Gains` two more numbers (`flipEngines`, `brakeEngines`) and added an `engines` override
argument to `control(s, g, engines)`. Every caller passed one — `run`, `measure`, `learn`, the whole training loop —
so the override always won and the two new numbers **had no effect on the score at all**. CEM reported values like
1.69 and 2.41 because they drifted freely, and I nearly wrote them into the article as findings. Worse, the page
asked its worker to teach a network with `engines: 0`, and `engines ?? default` keeps a 0: the teacher in the
browser was flying with no engines lit.

Fixed by deleting the override. `control` reads the gains, and anything that wants a fixed count builds its own
`Gains` through `withEngines(g, n)`.

### The rewrite: ask for a thrust, then light what can deliver it

Each Raptor spans 40–100 %, so one engine gives 0.90–2.26 MN, two 1.80–4.51, three 2.71–6.77. The ship weighs about
1.26 MN at touchdown. That number is **inside one engine's range and below two engines' floor**, which is the whole
story: on one engine it can hold any descent rate; on two or more it can only throw itself up and fall back.

So the landing law stopped switching the engines on and off and started asking for a thrust —
`want = m (g + chase · (speed − target))` — and lighting the fewest engines that can produce it (`choose()`).
One new learned number, `chase`, replaces a bang-bang decision.

What one flight then looks like (seed 5003, `scripts/rocket/profile.ts`), and the page shows exactly this:

| height | falling | it lights |
| --- | --- | --- |
| 1434 m | 69 m/s | nothing — belly-down |
| 770 m | 67 m/s | **1** × 53 % — the flip |
| 105 m | 41 m/s | **2** × 50 % — one engine cannot brake this |
| 42 m | 5 m/s | **1** × 90 % — the last forty metres |

341 steps on one engine, 23 on two. Nobody wrote that sequence.

### What the trainer picks, eight seeds (`scripts/rocket/choice.ts`, 50 iterations × 14 episodes)

**Every one of the eight flips on a single engine** (1.02–1.39). The braking cap splits, 1.4–1.7 or 2.6–3.0, and
both work, because the count that matters is the one the thrust demand picks at each moment. Landing rates on 300
unseen descents: 64.7, 83.7, 86.3, 90.0, 94.0, 96.0, 98.0, 99.0 %.

The page now flies seed 97's numbers:
`[772, 3.99, 0.36, 1.0, 1.67, 0.43, 0.53, 1.10, 1.72, 3.15]` — 98.7 / 98.0 / 99.3 % on three separate blocks of 300
descents, 1.17 m/s touchdown, 14.7 t of propellant left, 7.7 m from the middle of the pad. It ignites at 772 m
against the real ship's ~500 m.

Leftover fuel is now part of the score, and **only when it lands** — paying for fuel on a crash makes never lighting
the engines the cheapest strategy, which is the same reward-hacking trap as the music article's. Adding it pulled
ignition from ~1100 m down to ~800 m and roughly doubled the propellant left (7 t → 15 t); weighting it as heavily
as landing itself cost too many landings, so it is worth 60 against landing's 500.

### The network, again (`scripts/rocket/net-seeds.ts`)

Three heads — fire?, how hard, how many — could not do it: 0 of 200 on all five seeds. The trace showed why, and it
was not the engine count. It copied the teacher perfectly from 1450 m down to about 40 m and then **hovered**: with
a discrete gate, a duty cycle that is a few percent too generous balances gravity exactly, and it hung between 3 and
16 m until the 90-second budget ran out. Not a crash — it just never landed.

Giving it the same interface the autopilot uses fixed it. One output, the thrust it wants in units of the ship's own
weight, through the same `choose()`:

| seed | 7 | 19 | 31 | 43 | 57 |
| --- | --- | --- | --- | --- | --- |
| three heads | 0 % | 0 % | 0 % | 0 % | 0 % |
| one thrust number | 46.5 % | 4.5 % | **98.0 %** | 88.5 % | 60.0 % |

Teacher on the same 200: 98.5 %. The best seed matches it at 1.01 m/s; the worst is useless. `teach()` now keeps the
**best** round rather than the last (round 6 is often worse than round 3), and validates on 60 episodes. Decaying
the learning rate across rounds made it worse (10.5 / 1.5 / 99.0 / 9.0 / 15.0 %) and was reverted.

So the honest headline stands, and it is sharper than before: **ten numbers land 98 % of the time, every time you
train them; seven hundred weights copying those ten numbers land somewhere between 5 % and 98 % depending on where
they started.**

## What a reader's own training run produces (2026-09-23)

`scripts/rocket/page-train.ts`, ten seeds, each measured on 200 unseen descents.

| what the page runs | worst | median | best | ≥ 80 % | time |
| --- | --- | --- | --- | --- | --- |
| `learn(20, rng, 8)` (before) | 2 % | 77 % | 98 % | 5 of 10 | 0.5–1.0 s |
| `learn(35, rng, 10)` | 65 % | 88 % | 97 % | 7 of 10 | 0.5–1.1 s |
| plus a fading exploration floor (now) | 0 % | **95 %** | 98 % | **9 of 10** | 1.0–1.9 s |

Still about a second. The split is almost entirely **how many engines it flips on**: at the old budget the seven
runs that flipped on one averaged 85 % and the three that flipped on two averaged 30 %; with the current settings
nine of ten flip on one and land 80–98 %, and the one that flips on two lands nothing at all.

The exploration floor is `start_sigma × 0.2 × (1 − round/rounds)` added under the elite's own spread. Without it the
six elite agree on two engines early, the sampling width collapses around that, and the run never finds out that one
is better.

## Reward hacking, measured (2026-09-23)

`scripts/rocket/hack.ts` — same simulator, same CEM, three score functions, 200 unseen descents each.

| score | result |
| --- | --- |
| landing 500 + fuel 60 **only if it landed** (the page's) | 97.5 % landed, 1.2 m/s, 14.7 t left |
| landing 500 + fuel 60 **always** | 96.0 % landed — the trap did not fire |
| "stay alive, be near the pad" (one point per step + distance) | **15 % landed**, engines lit 86 % of the time, 0.7 t left, 106 of 200 ran the tanks dry and 54 were still airborne at the 90-second cutoff |

The third is the textbook hack and it is worth the article: asked to survive, it learned to **hover until the
propellant ran out**, because every step alive scored and landing only stopped the scoring.

The second is the more useful lesson for me. I predicted it would learn "never light the engines" to keep a full
tank, wrote that prediction into the notes as if it were a finding, and it is wrong — the 500 for landing still
dominates. Guessing how a reward breaks is no more reliable than guessing what a model will learn.

## Where the scripts are

Unlike the earlier articles, these are not copies: every measurement here comes from a script that lives in the repo
and imports the article's own components, so lint and `tsc` keep them honest.

| script | what it prints |
| --- | --- |
| `scripts/rocket/pack-starship.mjs` | rebuilds `public/posts/rocket-landing/ship.bin` from the glTF |
| `scripts/rocket/choice.ts` | CEM over the ten constants, eight seeds, and what each picks |
| `scripts/rocket/profile.ts` | one flight, printing every change of engine count |
| `scripts/rocket/flip.ts` | how far the flip throws the ship sideways |
| `scripts/rocket/page-train.ts` | what a reader's own press of "訓練一個" produces |
| `scripts/rocket/net-seeds.ts` | the network, five seeds |
| `scripts/rocket/hack.ts` | three reward functions, one of them hacked |
