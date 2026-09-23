# Music AI spike — lab notebook

Question: can a reader train a small music model in the browser, in minutes, that makes calm music worth listening
to? And the honest follow-ups: does it compose or copy, and does it beat a few lines of rules?

Everything here ran in node with `lib/ml` (the code the browser runs), on an M4 Pro. Scripts, data and runs are in
`Desktop/Paul/music-work/` (outside git); copies of the scripts are kept beside this file.

## Data (2026-09-22)

- **Source: Craig Sapp's digital edition of 370 Bach chorales**, <https://github.com/craigsapp/bach-370-chorales>,
  **CC BY-NC-SA 4.0**. Non-commercial use with attribution is fine for this site; anything derived from it that we
  publish (the token file, trained weights) must carry the same licence.
- Rejected: `czhuang/JSB-Chorales-dataset` (the one papers use) declares no licence; music21's chorales are
  distributed with permission for music21 only; the Nottingham folk set is GPL-3.0 and mostly jigs and reels, not calm.
- `convert.py` (music21) parses the kern files, transposes each chorale to C major or A minor (the smaller shift, at
  most a tritone), and samples an eighth-note grid: per step, the MIDI pitch of S A T B, whether it starts there, and
  fermatas. All 370 convert. 39,602 steps (107 per chorale on average), 194 major, 176 minor; 331 in 4/4, 38 in 3/4.
  Rests are 1.0 % of voice-steps. Spot check: chor001 (G major, shifted +5) opens C3 E4 G4 C5, which is its GG B d g.
- Tokens: one per voice per step, S A T B: a new note is its pitch (MIDI 31–84, 54 ids), a held one HOLD, silence
  REST. Vocabulary 56. Split by chorale with a fixed seed: 333 train (143,232 tokens), 37 validation (15,176).

## Yardsticks (`baseline.ts`)

None of these says "beautiful". They say whether the texture does what four-part writing does. Reference values are
Bach's own validation chorales.

| | in key | parallel 5ths/8ves per 100 steps | voice crossings | roughness | distinct chords per 100 steps |
| --- | --- | --- | --- | --- | --- |
| Bach (37 validation chorales) | 97.7 % | 0.16 | 2.6 % | 0.67 | 40 |
| Rules: pentatonic 1/f melody over I–vi–IV–V (5 seeds) | 100 % | 19.8 | 0 % | 0.50 | 19 |
| 5-gram, T 0.7 (3 seeds) | 79.5 % | 2.1 | 72 % | 0.90 | 83 |

- In key: C major's pitch classes plus F# and G# (A minor's raised 6th and 7th). Roughness: Plomp–Levelt after
  Sethares, 6 harmonics at 1/k per note, summed over all partial pairs, averaged per step.
- The rule composer never plays a wrong note and is the smoothest, but moves its block chords in parallel
  constantly: 120 times Bach's rate. It also has half the harmonic variety.
- n-gram validation loss (nats per token, add-0.05 smoothing, the context includes which voice is next):
  1-gram 2.133, 2-gram 1.695, 3-gram 1.510, 4-gram 1.472, **5-gram 1.462**, 6-gram 1.595, 8-gram 1.927.
  **1.46 is the line the Transformer has to cross.**
- The 5-gram composes badly despite that loss: voices cross on 72 % of steps. Its window is the previous step's four
  tokens, and a held note is the token HOLD, so a voice that has held for one step has forgotten its own pitch.

## Transformer runs (`train.ts`)

Adam, lr 3e-3 with 100 warm-up steps and cosine decay to a tenth, batch 8 windows, 4 heads, windows start on a step
boundary. Samples start from a C major chord (C5 G4 E4 C3) and run 64 steps (8 bars); three seeds per temperature.

Speed (node, one thread): d 64, 2 layers, 32-step window (128 tokens), 114,944 parameters: about 290 ms per step.
d 48, 2 layers, 16-step window: about 145 ms per step. So three minutes in the page is roughly 600 or 1,250 steps.

**A bug to remember:** the first samples crossed voices on 60 % of steps. Sampling slid the context window one token
at a time, so position 0 stopped being the soprano and every voice read as its neighbour. The window must slide by
whole steps (`ceil((len − ctx) / 4) × 4`). Training was never affected; `eval.ts` re-scores saved checkpoints with the
fix. Any number logged by `train.ts` before the fix (its `log.txt` checkpoint lines) is void.

### Run B: d 48, 2 layers, 16-step window (64 tokens), 4,000 steps, 300 s in all

`eval.ts`, 5 seeds × 64 steps from the C major chord, temperature 0.7:

| step | ≈ time | val loss | in key | parallels /100 | crossings | held | chords /100 | longest copy (steps) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0 | 4.11 | 88 % | 5.3 | 84 % | 1 % | 96 | 1 |
| 100 | 15 s | 1.98 | 99 % | 1.9 | 35 % | 77 % | 31 | 2–8 |
| 250 | 35 s | 1.58 | 99.6 % | 10.3 | 4.4 % | 45 % | 52 | 2–4 |
| 500 | 70 s | 1.40 | 99 % | 11.9 | 0.3 % | 49 % | 35 | 4–8 |
| 1000 | 145 s | 1.20 | 99.4 % | 7.5 | 1.9 % | 47 % | 41 | 4–6 |
| 2000 | | 1.08 | 99.7 % | 6.6 | 1.9 % | 48 % | 42 | 4–6 |
| 4000 | | 0.98 | 98.9 % | 6.6 | 0.3 % | 55 % | 36 | 6–9 |

(The times assume ~145 ms per step; this run shared the machine with run A, so its own wall clock was not clean.)

- It passes the 5-gram's 1.46 before step 500, a little over a minute.
- Order of learning, as the table shows it: first "hold notes" (step 100 holds 77 %: it drones), then voices stop
  crossing (by 250–500), key and rhythm settle; parallel fifths are last and never get near Bach (6.6 vs 0.16).
- Copying grows with training: at 1,000 steps the longest stretch found verbatim in the training set is 4–6 eighths
  (under a bar); at 4,000, 6–9. For comparison, a chorale is about 107 steps long.
- At temperature 1.0 everything is looser (crossings 4–15 %, in key 97 %).

### Preference tuning (`dpo.ts`): the reader's clicks, simulated

DPO on the step-1000 checkpoint of run B. Each "click" is a pair of samples (16 steps, temperature 1.0) and a judge
picks one; ties are skipped. 4 pairs per Adam update, lr 3e-4. Evaluated on 8 fresh 64-step samples at 0.7.
Before: parallels 12.3 per 100 steps, held 48 %, chords 45 (these 8 seeds; the 5-seed table above says 7.5).

| judge | β | pairs | parallels | held | chords | val loss | reading |
| --- | --- | --- | --- | --- | --- | --- | --- |
| fewest parallels | 0.2 | 40 | 5.9 | **73 %** | **25** | 1.199 | reward hacking: it learned to move less |
| fewest parallels | 1.0 | 40 | 10.5 | 55 % | 36 | 1.199 | a tighter leash: hacks less, learns less |
| fewest parallels **per step on which voices move** | 0.2 | 40 | 12.7 | 47 % | 44 | 1.205 | no effect at 40 |
| same | 0.5 | 80 | **7.0** | 52 % | 41 | 1.209 | learned the rule without gaming it |
| more held notes ("calm") | 0.5 | 20 | 6.1 | 68 % | 27 | 1.204 | 20 clicks audibly slower |
| more held notes | 0.5 | 40 | 1.6 | 89 % | 11 | 1.225 | too far: a drone |

- 40 pairs take about 12 s in node; each pair draws two samples, so a human-paced version is bound by listening,
  not computing. **Twenty choices is enough to move the music audibly**, which is a count a reader will make.
- The first judge is the article's best moment: asked for fewer mistakes, the model found that the way to make none
  is to play nothing. The fix is the one real RLHF uses: a judge that cannot be gamed that way, and a leash (β).
- Single runs, 8 samples each: the direction of every row is clear, the second digit is not. Seeds before prose.

### Listening pack

`music-work/listen/` (MP3, 35–40 s each, 60 bpm eighths = 0.5 s, soft additive organ + feedback-delay reverb):
Bach's chor127 (validation), the rules, the 5-gram, run B at 0 / 100 / 250 / 500 / 1,000 / 4,000 steps, and the four
DPO results above, and run A at 4,000 steps. **Nobody has listened yet; the metrics are proxies.** Paul's ears decide.

### Run A: d 64, 2 layers, 32-step window (128 tokens), 114,944 parameters, 4,000 steps, 1,185 s

Same evaluation, temperature 0.7: step 1,000 val 1.09, parallels 7.5, crossings 1.3 %, chords 29; step 4,000 val
**0.93**, in key 98.6 %, parallels **5.0**, crossings 0.3 %, held 48 %, chords 45, longest copy 6–10.
Twice the context and 1.4× the width buys 0.05 nats and a little on parallels; it does not close the gap to Bach's
0.16. At about 300 ms per step (sharing the machine) it gets 600 steps in three minutes against B's 1,250, and B at
1,250 is ahead of A at 600. **For the page, B's size is the right one.**

### Open

- Timing in a real browser (a worker): node's V8 should be close; measure it.
- Seeds for the DPO table; the judge a reader would really be (a human) is slower and noisier than these.
- Whether the samples are pleasant at all.

## Timbre (2026-09-22, after Paul's first listen: "the key is fine but it is too sharp")

The first organ was 5 harmonics at 1/k², a 60 ms attack and four undamped feedback delays (a metallic ring).
`synth.ts` has three softer voices, all through a Freeverb-style reverb (8 damped combs + 4 all-passes, stereo) and a
12 dB/octave low-pass at 3.2 kHz on the mix:

- **pad**: fundamental + soft octave, each doubled 4 cents apart (slow beating), 350 ms attack, 1.4 s release.
- **epiano**: two-operator FM whose index decays (bright for a moment, then round), 2.2 s decay.
- **flute**: sine + a little 2nd harmonic, a breath of noise on the attack, 4.8 Hz vibrato fading in.

Band levels relative to the whole spectrum (`hiband.ts`, 4096-point Hann FFT frames; Bach's chor127 / the AI sample):

| voice | 1–4 kHz | above 2 kHz |
| --- | --- | --- |
| old organ | −19.0 / −19.7 dB | −33.4 / −32.5 dB |
| pad | −25.1 / −25.1 dB | −82.9 / −54.7 dB |
| epiano | −25.9 / −26.8 dB | −59.2 / −51.8 dB |
| flute | −34.7 / −34.9 dB | −49.2 / −50.1 dB |

Two measures I tried first and threw away: the spectral centroid (475 → ~340 Hz) is dominated by the fundamentals
and says little about harshness; "signal minus a low-pass" is not a high-pass (the low-pass's phase lag leaves the
low end in), and reported 20–30 % above 2 kHz for every voice. Listening files: `music-work/listen/timbres/`.

## In the page (draft № 014, 2026-09-22)

- Chromium (Playwright, M4 Pro), the worker in `content/posts/music-ai/components/music.worker.ts`: 1,200 steps in
  83 s, **69 ms per step**, validation loss 1.17 at the end (24 fixed windows). Half node's 145 ms, which was measured
  while run A shared the machine. The figure now trains 2,400 steps (about 2.8 minutes).
- The article's learning-order table is run B's (cosine over 4,000 steps); the page's schedule decays over 2,400.
  Rerun the table with the page's exact recipe before publishing.

## Fig 03 and the player (2026-09-23)

- The blind test ships as fig 03: four bars each of Bach (an excerpt of a validation chorale, never trained on), the
  step-1,000 model at temperature 0.7, and the rules composer, shuffled. The piano rolls stay hidden until the reader
  answers, because a chorale and a block-chord machine are obvious on sight. One live round measured, for a sanity
  check: Bach parallels 0.0 / 72 chords per 100 steps, rules 18.8 / 31, the AI 9.4 / 66 — the same ordering as the
  offline table.
- Three bugs Paul found while playing with the draft, all in the shared player:
  1. Changing the timbre only restarted the sound in fig 01, because each figure did it for itself. The player now
     owns "what is playing" and every figure asks it to restyle, keeping the position and with no gap in the sound
     (the old buffer plays until the new one is ready).
  2. The music kept playing after navigating away: nothing stopped the page-level player when the figures unmounted.
     The last figure to leave now stops it, terminates the synth worker and closes the AudioContext (verified: the
     context goes from `running` to `closed`).
  3. Play stayed "Stop" for three or four silent seconds at the end, because the buffer carries a three-second
     reverb tail. Playback now counts as finished when the music ends plus 0.8 s: a 24-second piece flips back at 25 s.

## UI review of the draft (2026-09-23)

Checked at 1440 and 390, both themes, with axe (no violations before or after) and the network log. Thirteen things
changed; the ones worth remembering:

- **A shared worker needs to say who asked.** Figures 02 and 03 now use one worker (judge.bin 223 KB and the
  chorales are fetched and parsed once, not twice), and the first version broadcast every reply to both: loading the
  judge reset the blind test to its loading screen. Every message carries the id of the figure that asked.
- Auto-play used to take the stage: pick an earlier snapshot to listen to and the next one stole it. Choosing a
  snapshot by hand now pins it, and later ones are marked "new" instead.
- Figure 02 could only be read, not heard — the whole article is about listening. It now has "hear what it writes
  now" and "start over", and says that about twenty picks is where the difference becomes audible.
- The numbers had no explanation anywhere ("6.3 per 100 steps" of what?). One line under them now says a step is an
  eighth note, eight make a bar, and what the validation error means.
- The piano roll's alternative text in figures 02 and 03 claimed "six bars written at step 0", copied from figure 01.
- Training's "Stop" sat beside playback's "Stop": it is "Stop training" now. The progress bar has an estimate again.
- The auto-play checkbox was 13 px with a 16 px label; the label is now 24 px tall with the site's `tap` hit area.

## DPO at the page's own recipe (2026-09-23)

The table above updates once per four choices at lr 3e-4. The page updates on every choice at lr 1e-4, so the
article's numbers were re-measured with the page's recipe (8 samples of 64 steps at 0.7; before: parallels 12.3,
held 48 %, chords 45, val 1.195):

| judge | picks | parallels | held | chords | val |
| --- | --- | --- | --- | --- | --- |
| more held notes ("calm") | 20 | 6.1 | 64 % | 28 | 1.194 |
| more held notes | 40 | 3.9 | 78 % | 21 | 1.196 |
| fewest parallels (gameable) | 40 | 10.9 | 58 % | 35 | 1.200 |
| fewest parallels (gameable) | 80 | 8.0 | 63 % | 29 | 1.199 |
| parallels per moving step | 80 | 7.0 | 63 % | 29 | 1.199 |

**The clean reward-hacking contrast does not reproduce at this gentler push.** Both judges drift toward holding
(63 % either way) and the hack-proof one only buys 8.0 → 7.0. The sharp version (gameable 5.9 with 73 % held and 25
chords, versus hack-proof 7.0 with 52 % held and 41 chords) needs the harder push. The article now says exactly
that: the harder you optimise, the more gaming pays, which is the real lesson; the figure stays gentle so that
twenty clicks do not wreck the model. Paul chose to keep the page's learning rate as it is.

## The page's own recipe, measured twice (2026-09-23) — the table the article prints

`train.ts page-2400 2400 48 2 16 8 3e-3`, twice (seeds 7 and 11), 195 s each in node; `eval.ts`, five pieces of 64
steps at temperature 0.7 per checkpoint. The article's table is the mean of the two runs.

| step | val | in key | crossings | held | parallels | chords | longest copy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 4.51 | 82 % | 87 % | 0.5 % | 3.9 | 97 | 1 |
| 100 | 2.01 | 99 % | 36 % | 78 % | 1.1 | 30 | 2–5 |
| 250 | 1.60 | 99.7 % | 1.9 % | 50 % | 9.8 | 45 | 2–4 |
| 500 | 1.39 | 99.6 % | 1.1 % | 55 % | 10.0 | 34 | 2–6 |
| 1000 | 1.21 | 98.7 % | 1.8 % | 54 % | 12.0 | 38 | 3–6 |
| 2000 | 1.07 | 99.2 % | 1.3 % | 53 % | 8.9 | 38 | 6–10 |
| 2400 | 1.05 | 99.5 % | 0 % | 65 % | 7.2 | 28 | 5–10, once 32 |

- Held notes rise again at the end of the cosine decay (70 % and 59 % in the two runs), so the model the reader ends
  up with is slower than Bach's 45 %. The article says so rather than quoting the mid-training number.
- **One sample in ten copied 32 steps — four whole bars — from a training chorale** (run 7, step 2,400). The other
  nine were 5 to 10. It is in the article: the model can hold a passage verbatim, and the copy detector is the way to
  catch it.
- Parallel fifths never settle: 7 to 12 per hundred steps the whole way, against Bach's 0.16.
- Run B (the 4,000-step schedule) is still the reference for the DPO work, because judge.bin is its step-1,000
  checkpoint.

## Where everything lives

- In the repo: the article (`content/posts/music-ai/`), the data files (`public/posts/music-ai/*.bin`, CC BY-NC-SA
  4.0), the packing scripts (`scripts/music/convert.py`, `scripts/music/pack.ts`), these notes and copies of the
  research scripts beside them.
- Outside the repo, in `Desktop/Paul/music-work/`: the corpus clone (`bach-370-chorales/`), `chorales.json`, every
  run under `runs/`, the rendered WAV and MP3 packs (`listen/`, `timbres/`). `pack.ts` in the repo reproduces both
  `.bin` files from `chorales.json` and a checkpoint, byte for byte.
