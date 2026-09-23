# RSA spike — lab notebook

Question: can a reader generate a public key in the page, encrypt a sentence with it, and then watch the key
fall — and can the curve they measure teach them why 2048 bits does not fall? And the honest follow-up: is the
curve they measure the curve that actually protects them?

Everything here ran in node 22.19 (one thread, native BigInt, no libraries) on an M4 Pro, macOS 26.6.2.
Scripts and raw output are in `Desktop/Paul/rsa-work/` (outside git): `rsa.ts` (keys, primes, modular
exponentiation), `factor.ts` (four ways to break them), `bench-*.ts`, `extrapolate.ts`, raw runs in `runs/`.
Times are medians over seeds; where a spread matters it is printed, because for two of these algorithms the
spread **is** the finding.

---

## 1. Can the page do RSA at all? Yes, easily (`bench-keygen.ts`, 10 seeds per size)

Key generation is Miller–Rabin (20 rounds) over random odd candidates pre-sieved by the primes under 1000.
`e` is the smallest of 3, 5, 17, 257, 65537 that is coprime to φ and smaller than it; the sentence encrypted is
36 bytes, cut into ⌊(bits−1)/8⌋-byte blocks.

| key bits | keygen ms (min / med / max) | bytes per block | blocks for the sentence | µs per encrypt block | µs per decrypt block |
| --- | --- | --- | --- | --- | --- |
| 16 | 0.01 / 0.01 / 0.07 | 1 | 36 | 0.17 | 0.68 |
| 24 | 0.02 / 0.07 / 0.14 | 2 | 18 | 0.06 | 0.25 |
| 32 | 0.02 / 0.03 / 0.18 | 3 | 12 | 0.17 | 1.0 |
| 48 | 0.05 / 0.09 / 0.23 | 5 | 8 | 0.21 | 2.0 |
| 64 | 0.06 / 0.08 / 0.22 | 7 | 6 | 0.20 | 3.7 |
| 128 | 0.17 / 0.37 / 0.86 | 15 | 3 | 0.51 | 21 |
| 256 | 0.85 / 1.4 / 6.1 | 31 | 2 | 0.42 | 62 |
| 512 | 3.4 / 6.4 / 12.5 | 63 | 1 | 1.0 | 247 |
| 1024 | 12 / 33 / 102 | 127 | 1 | 1.9 | 1,357 |
| **2048** | **61 / 356 / 1,042** | 255 | 1 | 1.1 | 8,374 |

- **A real 2048-bit key generates in a third of a second in node, 116 ms in Chromium** (§3), worst case one
  second over ten seeds. There is no performance reason for the article to fake anything: the reader can make
  a genuine key and a genuine 16-bit toy key with the same code, which is the whole point of the piece.
- Decryption at 2048 bits is 8.4 ms in node, 3.0 ms in Chromium — `d` has 2048 bits of which 1005 are 1,
  so square-and-multiply does
  **3,053 multiplications of 2048-bit numbers**. Encryption with a small `e` is 7,600 times cheaper.
  That asymmetry is itself a figure: the same operation, 1.1 µs one way and 8,374 µs the other.
  (The 1024- and 2048-bit rows come from the 10-seed clean run in §3; the earlier 5-seed pass gave a 212 ms
  median at 2048 and is superseded.)
- The spread on 2048-bit keygen (61 ms to 1,042 ms, 17×) is the prime search: how many candidates you burn before
  two of them are prime. Per prime, at 1024 bits, the median is 267 candidates (range 9–908 over 20 seeds);
  the prime number theorem's estimate for odd candidates is ln(2^1024)/2 = 355, and pre-sieving by the small
  primes is what takes the measurement below it. **If the page shows a progress bar for key generation, it has
  to be honest that the wait is random, not proportional.**

### Small keys force a small `e`, and that is a finding, not a nuisance

65537 does not fit below φ until the modulus is about 34 bits, so every toy key in this article has e = 3, 5 or 17.
That is not a simplification we chose — it falls out of the size. It also hands us §5.4 for free.

---

## 2. The breaking curve (`bench-factor.ts`, 8 seeds per size, 8 s budget per attempt)

Four algorithms, all written from scratch, all on BigInt, all given a deadline — though one of them does not
really honour it (see "a tab that freezes" below). Each row is 8 keys at that size;
a row is the last one printed for an algorithm when it first failed or spent its whole budget.
Every reported factor was checked to divide `n`.

| key bits | trial division | Fermat | Pollard's rho | toy quadratic sieve |
| --- | --- | --- | --- | --- |
| 32 | 0.10 ms | 0.09 ms | 0.02 ms | 8.6 ms |
| 40 | 1.4 ms | 0.12 ms | 0.08 ms | 1.9 ms |
| 48 | 22 ms | 2.6 ms | 0.27 ms | 6.3 ms |
| 56 | 358 ms | 19 ms | 0.91 ms | 8.3 ms |
| 60 | 1,452 ms | 463 ms | 1.7 ms | 8.8 ms |
| 64 | **gave up (8/8)** | 2,922 ms | 3.6 ms | 23 ms |
| 72 | | | 67 ms | 11 ms |
| 80 | | | 161 ms | 15 ms |
| 88 | | | 773 ms | 67 ms |
| 96 | | | 3,093 ms* | 109 ms |
| 112 | | | | 262 ms |
| 128 | | | | 1,515 ms |
| 144 | | | | 6,465 ms (3/8 gave up) |

Medians. The same table with the spread, which the article must not hide:

| key bits | trial min–max | Fermat min–max | rho min–max | qs min–max |
| --- | --- | --- | --- | --- |
| 48 | 15–28 ms | **0.00–118 ms** | 0.16–0.52 ms | 0.28–114 ms |
| 60 | 1,102–1,680 ms | **6.7–4,630 ms** | 0.87–4.2 ms | 3.2–161 ms |
| 96 | | | 1,430–8,000* ms | 35–1,688 ms |

\* One of the eight ran past the 8 s budget. Re-run with 120 s it finishes in 8.3 s, making the true median
3,156 ms; the ceiling table below is the run to quote for 96 bits and up.

- **Trial division and rho are well behaved; Fermat is not.** At 60 bits Fermat's eight keys span three orders of
  magnitude, because its cost depends on the gap between `p` and `q`, not on the size of `n`. That is the
  article's best "same key size, wildly different answer" moment, and §5.2 turns it into a figure.
- **The toy sieve is the flat one.** From 64 to 128 bits — a factor of 2^64 in the size of `n` — it goes from 23 ms
  to 1.5 s, 66×. Over the same stretch rho's fitted slope says it would need 2^18 — about 300,000 — times longer.

### Where each algorithm stops (fits from §4, refitted on the merged data in `refit.ts`)

| algorithm | median 1 s at | median 5 s at | median 1 min at |
| --- | --- | --- | --- |
| trial division | 59 bits | 64 bits | 71 bits |
| Fermat (random primes) | 65 bits | 70 bits | 77 bits |
| Pollard's rho | 90 bits | 98 bits | 110 bits |
| toy quadratic sieve | 119 bits | 141 bits | 178 bits |

Those are fits. Measured directly at the ceiling (`bench-ceiling.ts`, 8 seeds, 120 s budget):

| | 96 | 104 | 112 | 128 | 136 | 144 | 152 | 160 | 176 bits |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rho, median | 3.2 s | 19 s | 79 s | | | | | | |
| rho, min–max | 1.4–8.3 | 6.1–40 | 29–108, **1 of 8 unfinished** | | | | | | |
| sieve, median | 0.11 s | 0.25 s | 0.26 s | 1.7 s | 5.0 s | 6.7 s | 16 s | 29 s | 86 s |
| sieve, min–max | | | | 1.1–5.5 | 3.0–12 | 3.3–18 | 7.9–21 | 8.5–34 | 71–120, **1 of 8** |

**Rho's real wall is 104–112 bits. The sieve has no wall a reader will meet** — it is still solving 176-bit
keys, it just stops being a thing you watch. 128 bits at 1.7 s is the largest break that still feels live.

### A tab that freezes: the deadline is not enough (`bench-chunks.ts`)

A deadline only helps at the points where the code looks at the clock. Longest stretch between two of those:

| algorithm | 48 bits | 64 bits | 80 bits | 96 bits | where |
| --- | --- | --- | --- | --- | --- |
| trial division | 0.9 ms | 1.3 ms | | | one budget interval (65,536 steps) |
| Fermat | 0.3 ms | 0.3 ms | | | one budget interval (1,024 steps) |
| **Pollard's rho** | 0.1 ms | 3.8 ms | **136 ms** | **2,134 ms** | Brent's `advance` loop, r = 2^24 |

Brent's rho advances `y` by `r` steps between cycle lengths, and `r` doubles; that loop has no clock check in
it and cannot get one cheaply. At 96 bits it runs for **two seconds without yielding** — 133 dropped frames,
and a "stop" button that does not stop.

**So: the race figure is safe on the main thread up to 64 bits (3.8 ms, under a frame). Anything above 64 bits
must run in a worker**, and the worker must be `terminate()`-able rather than politely asked, because rho will
not answer for seconds at a time. This is a real constraint on figure 3, not a detail.

**So the slider should run 16 → 64 bits if the algorithms race together** — above 64 trial division stops
finishing, the race has a permanent loser, and rho stops fitting inside a frame — **and 16 → 128 bits for the
sieve alone, in a worker.** A tab can honestly break a 128-bit RSA key in 1.7 seconds.

### rho against the sieve: the crossover is at about 70 bits (`bench-extras.ts` B, 16 seeds)

| key bits | rho median (min–max) | sieve median (min–max) | winner |
| --- | --- | --- | --- |
| 64 | 5.5 ms (2.0–19) | 19 ms (2.7–378) | rho, 3.5× |
| 72 | 71 ms (9.5–172) | 11 ms (3.0–197) | sieve, 6.5× |
| 80 | 163 ms (20–546) | 18 ms (4.3–179) | sieve, 9.0× |
| 88 | 680 ms (149–2,236) | 89 ms (24–167) | sieve, 7.7× |
| 96 | 2,928 ms (1,444–8,759) | 99 ms (30–1,715) | sieve, 30× |
| 104 | 19,100 ms (6,144–44,944) | 261 ms (96–1,818) | sieve, 73× |

This is the shape of the whole subject in one table, at sizes a reader can watch live: **the better algorithm
does not win by a constant, it wins by more and more.**

---

## 3. In a real browser tab (`browser-bench.mjs`, headless Chromium 153, same bundle, same seeds)

The whole spike compiles to an **11.9 KB** IIFE with esbuild — no dependencies, nothing to download.

`node-ab.ts` and `page.html` run the identical subset on the identical seeds; the two columns below were
measured back to back on a quiet machine (an earlier pair, taken while a long factorisation ran on another
core, is in `runs/browser.txt` and agrees to about 15 %).

| | node 22.19 | Chromium 153 | |
| --- | --- | --- | --- |
| keygen 2048 bits (med of 10) | 356 ms | **116 ms** | 3.1× faster |
| keygen 1024 bits | 33 ms | **11 ms** | 3.1× |
| decrypt 2048 bits (one block) | 8.4 ms | **3.0 ms** | 2.8× |
| trial division, 48 / 56 bits | 22 / 350 ms | 19 / 307 ms | 1.1× |
| rho, 64 bits | 4.1 ms | 2.7 ms | 1.5× |
| rho, 80 bits | 168 ms | **44 ms** | 3.8× |
| rho, 96 bits | 3,309 ms | **860 ms** | 3.8× |
| sieve, 64 / 96 / 128 bits | 20 / 139 / 1,670 ms | 17 / 130 / 1,661 ms | 1.0× |

- **The page is the fast host, not the slow one**, and by more than the music-ai spike found for training.
  The gain is entirely in BigInt multiplication: modular exponentiation (keygen, decrypt) gains 3.1×, rho
  (multiply- and gcd-bound) 3.8×, trial division (remainder-bound) 1.1×, the sieve (mostly Float32 array
  work with BigInt only in the final trial division) nothing at all.
- Consequence for the figure: the gain is per-algorithm, not uniform, so it does not just shift the curve —
  **it changes the crossover.** At rho's slope of 0.286, 3.8× buys **6.9 more key bits**; at trial division's
  0.496, 1.1× buys **0.3 bits**; the sieve buys none. Rho's "a few seconds" ceiling moves 96 → ~103 bits in a
  browser, trial division's stays at 64, and rho holds out against the sieve a little longer than §2 says.
- Quote the browser numbers in the article, not the node ones, and re-measure in the page's own worker.

---

## 4. Extrapolating the measured curve (`extrapolate.ts`)

Fits of log₂(median ms) against key bits, on the sizes where the algorithm finished every seed:

| algorithm | fitted on | slope (bits of time per key bit) | time doubles every | R² | theory |
| --- | --- | --- | --- | --- | --- |
| trial division | 36–60 bits | **0.496** | 2.0 bits | 0.9998 | O(√n): 0.5 |
| Fermat | 36–60 bits | 0.477 | 2.1 bits | 0.919 | ~0.5 for random balanced primes |
| Pollard's rho | 44–104 bits | **0.286** | 3.5 bits | 0.990 | O(n^¼): 0.25 |

Trial division lands on its textbook exponent to three decimals. Rho comes out steeper than ¼ because the
arithmetic itself gets more expensive as `n` grows — a real effect the reader is measuring, not an error.

**So what does the reader's own curve say about 2048 bits?**

| key bits | trial division | Fermat | Pollard's rho |
| --- | --- | --- | --- |
| 128 | 641 years | 37 years | 34 min |
| 256 | 10²¹·⁹ years | 10¹⁹·⁹ years | 10⁶·⁸ years |
| 1024 | 10¹³⁶·⁷ years | 10¹³⁰·¹ years | 10⁷²·⁹ years |
| **2048** | **10²⁸⁹·⁷ years** | 10²⁷⁷·¹ years | **10¹⁶¹·⁰ years** |

The universe is 1.4 × 10¹⁰ years old. On the reader's own measured curve, one extra key bit costs the attacker
a factor of **1.219**, and 2048 bits is safe by 150 orders of magnitude.

### This extrapolation is wrong, and the page contains the proof

The number field sieve is sub-exponential: L_n[⅓, 1.923] = exp(1.923·(ln n)^⅓·(ln ln n)^⅔). Anchored on the
largest published RSA factorisation — **RSA-250, 829 bits, 28 February 2020, ~2,700 core-years on Intel Xeon Gold
6130 at 2.1 GHz (2,450 sieving + 250 linear algebra)**, which is literature, not something measured here:

| key bits | NFS, core-years, scaled from RSA-250 | the reader's rho curve says |
| --- | --- | --- |
| 512 | 0.07 (≈ 26 core-days) | 10²⁸·⁸ years |
| 829 | 2,700 (the anchor) | — |
| 1024 | 5.4 × 10⁵ | 10⁷²·⁹ years |
| **2048** | **10¹⁴·⁸** | 10¹⁶¹·⁰ years |

- **The reader's extrapolation is wrong by about 10¹⁴⁶.** Not because they measured badly — the fit is
  R² = 0.990 over eleven sizes — but because they extrapolated the wrong algorithm.
- One extra key bit costs NFS a factor of **1.017**, not 1.219: its cost doubles every **41 bits**, not 3.5.
  Going 1024 → 2048 buys only 10⁹·¹, where the reader's curve promised 10⁸⁸.
- **512-bit RSA is not astronomy, it is a purchase.** The scaling above says 26 core-days; the published
  result is $75 and under four hours on EC2 (Valenta et al., *Factoring as a Service*, FC 2016). Our scaling is
  about 7× optimistic against that — the right order, the wrong second digit; the article should quote the
  paper's number, not ours.
- And 2048 bits is still safe: 10¹⁴·⁸ core-years is ten million cores running for ten billion years.
  **The reversal is not "RSA is weaker than you think". It is "your curve is not the curve".**

### The reader can watch the curve bend, in the page, at sizes that finish

This is the part that makes the reversal honest rather than an appeal to authority. The toy sieve in §2 is
already sub-exponential, and the crossover table shows it pulling away from rho: 3.5× behind at 64 bits,
73× ahead at 104. The reader does not have to take NFS on faith — they have already watched a sub-exponential
algorithm beat an exponential one on their own machine, at sizes where both finish in under a second.

### How much the extrapolation depends on the slope you fit (a caution for the article)

Fitting the toy sieve to its own asymptotic form, ln(ms) = a·√(ln n · ln ln n) + b, over 56–128 bits gave
**a = 0.659** where the theory says 1.0. Extending the same fit to 160 bits moved it to **a = 0.770**
(R² = 0.962). Two things follow, and both are measured, not argued:

| key bits | fitted slope 0.659 (to 128 bits) | fitted slope 0.770 (to 160 bits) | theoretical slope 1.0 |
| --- | --- | --- | --- |
| 128 | 1.1 s | 2.0 s | 3.5 s |
| 512 | 286 days | 25 years | 1.6 × 10⁴ years |
| 2048 | 10¹⁵·⁹ years | 10²⁰·¹ years | 10²⁸·⁵ years |

1. **Eight orders of magnitude at 2048 bits between the best fitted slope and the true one** (thirteen from
   the 128-bit fit), out of one coefficient, over a range the reader can actually run.
2. **Adding 32 bits of data moved the extrapolation by 10⁴·²** — and it moved *towards* the theory, which is
   what "not yet asymptotic" looks like from the inside. The reader's curve is not converging to an answer;
   it is still climbing towards one.

If the article makes an extrapolation figure, this is the caveat it owes, and it is a measured caveat rather
than a hand-wave. It is also the mechanism behind the reversal stated above: the reader's curve is too
shallow for the same reason at every size, and no amount of care in the measurement fixes it.

---

## 5. The three leaks that are worth a figure (`bench-attacks.ts`)

All three break RSA **without factoring anything**, in microseconds, at any key size. They are the article's
argument that "how many bits" is the least interesting question about a key.

### 5.1 Square-and-multiply, visible

`modPowTrace` in `rsa.ts` returns one row per bit of the exponent. With n = 2,587,576,561 and e = 257
(binary `100000001`), 7^e mod n is nine steps — S, S, S, S, S, S, S, S with a multiply at each 1 bit:

```
SM→7  S→49  S→2401  S→5764801  S→684796678  S→400111928  S→2011504976  S→2018641379  SM→690975509
```

The same trace at 2048 bits is 2,048 squarings and 1,005 multiplies — **3,053 operations on 2048-bit numbers,
8.4 ms in node, 3.0 ms in Chromium.** One figure, one slider (the exponent), the accumulator shown as it goes:
the reader sees why raising to a 617-digit power is not slow.

### 5.2 Bad primes: Fermat kills a 2048-bit key in one step

If `p` and `q` are chosen close together, `n` sits just under a perfect square and Fermat's method walks
straight onto it. Generating `q` as the next prime after `p`:

| key bits | q − p | Fermat steps | Fermat time | (rho, for scale) |
| --- | --- | --- | --- | --- |
| 32 | 2 | **1** | 0.02 ms | 0.15 ms |
| 64 | 14 | **1** | < 0.01 ms | 6.6 ms |
| 128 | 138 | **1** | 0.01 ms | — |
| 512 | 48 | **1** | 0.01 ms | — |
| 1024 | 264 | **1** | 0.02 ms | — |
| **2048** | **1,402** | **1** | **0.03 ms** | — |

And the dial between "fine" and "dead", on a 64-bit key, moving `q` away from a fixed 32-bit `p`:

| q − p | Fermat steps | time |
| --- | --- | --- |
| 14 … 65,550 (2¹ … 2¹⁶) | **1** | < 0.01 ms |
| 1,048,584 (2²⁰) | 33 | 0.01 ms |
| 16,777,232 (2²⁴) | 8,278 | 2.2 ms |
| 268,435,478 (2²⁸) | 2,058,481 | 469 ms |

Measured steps match (q − p)² / (8√n) to **0.03 %** at the top row (2,058,481 against 2,058,965). That is a
law the reader can discover by dragging a slider, which is the best kind of figure this site makes.

**This is the article's knockout punch**: let the reader tick "choose bad primes", keep 2048 bits, and watch
the key fall instantly. The number of bits did not change. Nothing about the key size was a lie. It still died.

### 5.3 No padding, part one: RSA becomes a substitution cipher

Textbook RSA is deterministic — the same block always gives the same ciphertext. With a small key the block
is one byte, so the ciphertext is a monoalphabetic substitution and a frequency count reads it. On a
159-byte paragraph:

| key bits | bytes per block | blocks | distinct ciphertexts | commonest block |
| --- | --- | --- | --- | --- |
| 16 | 1 | 159 | **28** | appears **30×**, and it is `" "` |
| 24 | 2 | 80 | 53 | 7×, `" s"` |
| 32 | 3 | 53 | 44 | 3×, `"the"` |
| 64 | 7 | 23 | 23 | 1×, `"the qui"` |

The 16-bit row is the figure: 159 encrypted bytes, 28 distinct symbols, the commonest one is the space.
The reader types their own sentence and sees their own spaces light up. Nothing was factored.

### 5.4 No padding, part two: a cube root, and the key size stops mattering

Small keys force a small `e` (§1), and real keys often use e = 3. With no padding, if m³ < n then c = m³ as
an ordinary integer and an integer cube root recovers the message with no key material at all:

| key bits | longest safe message (⌊(bits−1)/3/8⌋ bytes) | `"attack at dawn"` (14 bytes) | cube root |
| --- | --- | --- | --- |
| 128 | 5 | m³ > n, safe | fails, as it should |
| 512 | 21 | m³ < n | **recovered, 0.01 ms** |
| 1024 | 42 | m³ < n | **recovered, 0.01 ms** |
| **2048** | **85** | m³ < n | **recovered, 0.01 ms** |

**The bigger the key, the longer the message this works on.** A 2048-bit key with e = 3 and no padding leaks
any message up to 85 bytes instantly. It is the cleanest possible statement of the article's thesis: the
number of bits was never the thing keeping you safe.

---

## 6. Method, and what I threw away

**A quadratic sieve that did not work, and looked like a verdict.** The first version aligned the sieve's
starting index wrongly: instead of the first x ≥ offset with x ≡ r − root (mod p), it computed
`start − ((start − offset) mod p) + p`, which is not that index. It collected 1–6 relations in 15–20 s and
failed on every key. The conclusion it invited — "a sieve is not feasible in a page" — was the opposite of
the truth; the fixed version is the *fastest* thing here and reaches 176 bits. **Every number from that first
sieve run is void.** The lesson for the notes: an algorithm that returns "too slow" is not evidence until
it has returned "correct" at least once.

**The textbook factor-base size is wrong at toy sizes.** B = exp(½√(ln n · ln ln n)) is the asymptotic
optimum, and at 24 and 48 bits it gives 6 to 22 usable primes — too few smooth values exist, so the sieve
runs forever while 32 and 56 bits succeed in milliseconds. That looked like randomness and was a missing
restart: the sieve now doubles B after 400·B² positions and starts over (and enlarges again if every
dependency turns out trivial). With that, every size from 16 to 176 bits works. The article can keep this: **"the parameter
that is optimal for huge numbers is wrong for small ones" is true of most of cryptography.**

**A float64 fast path that was slower.** I wrote a `Number` version of trial division expecting it to be the
honest baseline and BigInt to be the handicap. It is the other way round, over 2 million `n % d`:

| n | BigInt | Number | |
| --- | --- | --- | --- |
| 2²⁰ (fits a V8 Smi) | 4.8 ms | 2.9 ms | Number 1.6× faster |
| 2³⁰ | 10.3 ms | 3.3 ms | Number 3.1× faster |
| 2⁴⁰ | 11.8 ms | 25.1 ms | **Number 2.1× slower** |
| 2⁵⁰ | 10.4 ms | 40.9 ms | **Number 3.9× slower** |

Above V8's small-integer range the double lands on the heap and `%` becomes a floating-point remainder.
So `trial(number)` is deleted from the results: **native BigInt is both the honest choice and the fast one**,
and the page needs no big-integer library. (`trialDivisionNumber` is kept in `factor.ts` only to reproduce
this table.)

**A constant I got wrong.** The first Fermat theory column used (q − p)²/(4√n). The right constant is 8 —
the number of steps is the arithmetic mean of p and q minus their geometric mean, which is (√q − √p)²/2 ≈
(q − p)²/(8√n). The measurement said so before I did: 2,058,481 steps against 2,058,965 predicted.

**Deliberate simplifications, recorded so nobody re-derives them later.**
- The sieve only sieves x ≥ 0, so Q(x) = (⌈√n⌉ + x)² − n is always positive and the factor base needs no −1
  column. Half the usual window, simpler figure.
- No large-prime variation and no multiple polynomials. **The 176-bit ceiling is therefore a lower bound**;
  a real MPQS would go further. Good — the article wants the honest small version, not a record attempt.
- `e` is the smallest of {3, 5, 17, 257, 65537} that fits. Real RSA fixes 65537, which does not fit below
  a 34-bit modulus. Every encryption timing here is for a small `e`, and 5.4 exists because of it.
- Miller–Rabin is 20 rounds with random bases, pre-sieved by the primes under 1000. No BPSW, no fixed
  deterministic base sets.
- Pollard's rho is Brent's variant with gcd batched 128 at a time, and restarts with a fresh c if it
  collapses to n. Its reported time includes its restarts. **Its deadline is honoured only in the batched
  part**; the `advance` loop between cycle lengths cannot check the clock, which is why it overruns its
  budget (112 bits: 120 s asked, 120.4 s taken) and why §2 says the figure needs a worker.

**Fermat's median is not a curve, and the article must not draw one.** Its R² of 0.919 is the worst here and
its spread at 60 bits is 700×. Fermat belongs in §5.2 as a *dependency on the primes*, never in the
"time against key size" figure as a third line.

**Every factor reported by every run was checked to divide n** before its time was recorded; a wrong or
trivial factor counts as a failure and scores the full budget.

---

## 7. What I would build, and what is still open

### Recommended: four instruments, not six

1. **`keygen`** — pick a size (16 … 2048), generate, type your own sentence, see the blocks and the
   ciphertext. Carries the whole mechanism, and the 2048-bit case proves nothing here is faked. Fold the
   square-and-multiply trace (§5.1) in as an expandable inside this figure rather than giving it its own —
   the article has a ten-minute budget.
2. **`race`** — trial division, Fermat and rho on the same `n`, three bars, **slider 16 → 64 bits**. Above 64
   trial division stops finishing and the race has a permanent loser; below 64 all three finish and their
   different shapes are visible. This is the "press break it and watch it fall" figure. 64 bits is also
   exactly where rho still yields inside a frame (3.8 ms), so this one figure can stay on the main thread.
3. **`curve`** — every break the reader performs drops a point on a log plot. A button extrapolates *their*
   points to 2048 bits and prints the absurd answer. Then the sieve is unlocked (**slider to 128 bits**,
   1.7 s at the top end), its points land on a visibly flatter line, and the NFS curve is overlaid. The spine
   and the reversal in one instrument. **This one needs a worker that can be terminated**, not a cooperative
   stop: above 64 bits rho goes up to two seconds without answering (§2). If the figure also lets the reader
   push the sieve past 128, say that 160 bits is 29 s and 176 is about a minute and a half — it does not fail,
   it just stops being something to watch.
4. **`badkey`** — two toggles on a 2048-bit key: "primes close together" and "no padding, e = 3". Each kills
   it instantly. The size never changes.

Cut: the sieve as a fourth racer in figure 2 (it *loses* to rho below 70 bits and muddies the story — it
belongs in figure 3, where losing then winning is the point), and `trial(number)` entirely.

### The honest reversal, in one sentence

> You will measure a curve that says 2048-bit RSA takes 10¹⁶¹ years to break. That curve is wrong by about
> 10¹⁴⁶ — not because you measured badly, but because nobody attacks RSA with the algorithm you raced; and
> you already watched a better algorithm bend the curve, in this page, at 104 bits. RSA is still safe. It is
> safe by a margin you cannot measure, which is not the same as the margin you did measure.

The second half is what stops the article being either a scare piece or a reassurance piece: the reader is
wrong about *why* they are safe, and the correction still leaves them safe.

### Open

- **Re-measure in the site's own worker.** §3 is a bundled IIFE in a bare page on the main thread; the
  article's numbers should come from the same build the reader runs, in the worker §2 says it needs.
- **Measure on a phone.** Every ceiling in this file is an M4 Pro's. The slope is the reader's machine's too;
  the intercept is not. If the race figure is to work at 390 px it needs a mid-range phone's numbers, and the
  article should say out loud that the reader's own curve will sit lower or higher than the one printed.
- **Is 1.7 s the right finale?** A 128-bit key in 1.66 s (Chromium) is the largest honest "watch it fall".
  Whether that reads as fast or as a hang needs Paul's eye on a prototype, not a number from me.
- **A fourth leak, not measured:** Håstad's broadcast attack — the same message sent to three people with
  e = 3 recovers by CRT plus a cube root. It would strengthen §5.4 but probably costs more minutes than it
  is worth.
- **Nothing here has been near a browser's `crypto.subtle`.** If the article claims "this is what your
  browser really does", that claim needs checking against WebCrypto's actual RSA-OAEP, which is the padding
  §5.3 and §5.4 are missing.

---

## Where everything lives

Nothing has been committed. Everything is in `Desktop/Paul/rsa-work/`, outside git:

| file | what it is |
| --- | --- |
| `rsa.ts` | keys, Miller–Rabin, modular exponentiation (+ the traced version), block encoding |
| `factor.ts` | trial division (BigInt and the rejected float64 one), Fermat, Brent's rho, the toy sieve |
| `bench-keygen.ts` `bench-factor.ts` `bench-attacks.ts` `bench-extras.ts` `bench-ceiling.ts` `bench-chunks.ts` | the six measurement runs, in the order §1–§5 quotes them |
| `extrapolate.ts` `refit.ts` | the fits; `refit.ts` merges the 8 s sweep with the 120 s ceiling run and is the one to trust |
| `browser-entry.ts` `page.html` `browser-bench.mjs` `node-ab.ts` | the Chromium A/B (esbuild → `bundle.js`, 11.9 KB) |
| `runs/*.txt` `runs/*.jsonl` | raw output of every run quoted here |

`bundle.js` is generated (`npx esbuild browser-entry.ts --bundle --format=iife --target=es2022`).
To reproduce a table: `npx tsx bench-<name>.ts`; the browser column needs a static server on
`127.0.0.1:8731` and `node browser-bench.mjs`.

**To land in the repo** (paul-cd or whoever has the checkout): this file at
`docs/research/rsa/RESULTS.md`, and copies of `rsa.ts`, `factor.ts` and the `bench-*.ts` beside it, as the
music-ai spike does. The raw `runs/` stay out here.
