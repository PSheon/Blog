/// <reference lib="webworker" />
import { mulberry32 } from "@/lib/ml";
import { Transformer } from "@/lib/ml";
import { CONFIG, Composer, CopyFinder, Judge, VOICES, compose, decode, load, parseChorales, report, rulesPiece, validate, window, type Report } from "./music";
import type { BlindItem, Reply, Request } from "./protocol";
import { render } from "./synth";

/*
 * Training, composing, preference tuning and the synthesiser all run here, so the page keeps scrolling. Snapshots are
 * taken where docs/research/music-ai saw the model change its mind: it drones first, then the voices stop crossing,
 * then the key and the rhythm settle.
 */
const SNAPSHOTS = [0, 100, 250, 500, 1000, 2400];
/** A composition is six bars: 48 eighths, 24 seconds. The blind test uses four, so three in a row stay listenable. */
const PIECE_STEPS = 48;
const BLIND_STEPS = 32;
const EVERY = 10;

const send = (reply: Reply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(reply, transfer);
let run = 0;
let data: ReturnType<typeof parseChorales> | null = null;
let finder: CopyFinder | null = null;
let judge: Judge | null = null;
let candidates: [number[], number[]] | null = null;
let before: Report | null = null;
let trained: Transformer | null = null;
let weights: Float32Array | null = null;

/** Run B at step 1,000, as shipped in judge.bin: the blind test composes with it and the judge figure tunes a copy. */
async function judgeWeights(): Promise<Float32Array> {
  weights ??= new Float32Array(await (await fetch("/posts/music-ai/judge.bin")).arrayBuffer());
  return weights;
}

async function trainedModel(): Promise<Transformer> {
  if (!trained) {
    trained = new Transformer(CONFIG);
    load(trained, await judgeWeights());
  }
  return trained;
}

async function chorales() {
  if (!data) data = parseChorales(await (await fetch("/posts/music-ai/chorales.bin")).arrayBuffer());
  finder ??= new CopyFinder(data.train);
  return data;
}

/** How the model writes right now, from eight seeds (the same eight every time, so a change is the model's): what the judge figure shows. */
function measure(model: Composer["model"]): Report {
  const reps = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => report(decode(compose(model, 32, 0.7, mulberry32(seed)))));
  const mean = (k: keyof Report) => reps.reduce((s, r) => s + r[k], 0) / reps.length;
  return { inKey: mean("inKey"), parallels: mean("parallels"), crossings: mean("crossings"), held: mean("held"), chords: mean("chords") };
}

self.onmessage = async ({ data: request }: MessageEvent<Request>) => {
  // Every reply goes back tagged with whoever asked, because two figures share this worker.
  const post = (reply: Reply, transfer: Transferable[] = []) => send({ ...reply, from: request.from }, transfer);
  if (request.type === "stop") { run++; return; }

  if (request.type === "render") {
    const audio = render(request.piece, request.timbre);
    post({ type: "audio", id: request.id, ...audio }, [audio.left.buffer, audio.right.buffer]);
    return;
  }

  if (request.type === "train") {
    const id = ++run;
    post({ type: "loading" });
    let d: Awaited<ReturnType<typeof chorales>>;
    try { d = await chorales(); } catch { post({ type: "failed" }); return; }
    const rng = mulberry32(request.seed), composer = new Composer(d.train, rng, request.steps);
    const valRng = mulberry32(99), valWindows = Array.from({ length: 24 }, () => window(d.val, valRng));
    const t0 = performance.now();
    let losses = 0, count = 0;
    const snapshot = () => {
      const piece = decode(compose(composer.model, PIECE_STEPS, 0.7, mulberry32(request.seed + composer.step)));
      post({ type: "snapshot", snapshot: { step: composer.step, seconds: (performance.now() - t0) / 1000, val: validate(composer.model, valWindows), piece, report: report(piece), copied: finder!.longest(piece.pitches).steps } });
    };
    snapshot();
    const chunk = () => {
      if (id !== run) return;
      for (let i = 0; i < EVERY && composer.step < request.steps; i++) { losses += composer.learn(); count++; }
      post({ type: "progress", step: composer.step, steps: request.steps, loss: losses / count, seconds: (performance.now() - t0) / 1000 });
      losses = 0; count = 0;
      if (SNAPSHOTS.includes(composer.step) || composer.step === request.steps) snapshot();
      if (composer.step < request.steps) setTimeout(chunk, 0);
      else post({ type: "done" });
    };
    setTimeout(chunk, 0);
    return;
  }

  if (request.type === "blind") {
    post({ type: "loading" });
    try {
      const d = await chorales(), model = await trainedModel();
      const rng = mulberry32(Math.floor(Math.random() * 2 ** 31));
      // Bach is an excerpt of a validation chorale — one the model never saw — starting on a bar line.
      const chorale = d.val[Math.floor(rng() * d.val.length)];
      const bars = Math.max(1, Math.floor(chorale.length / VOICES / 8) - BLIND_STEPS / 8);
      const from = Math.floor(rng() * bars) * 8 * VOICES;
      const items: BlindItem[] = [
        { who: "bach" as const, piece: decode(chorale.slice(from, from + BLIND_STEPS * VOICES)) },
        { who: "ai" as const, piece: decode(compose(model, BLIND_STEPS, 0.7, rng)) },
        { who: "rules" as const, piece: rulesPiece(BLIND_STEPS, rng) },
      ].map((x) => ({ ...x, report: report(x.piece) }));
      // Shuffled, so that A, B and C say nothing.
      for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
      post({ type: "blind", items });
    } catch { post({ type: "failed" }); }
    return;
  }

  if (request.type === "judge") {
    post({ type: "loading" });
    try {
      judge = new Judge(await judgeWeights());
      before = measure(judge.policy);
      // The first pair comes with the model, so the figure has something to play the moment it is ready.
      candidates = judge.pair(mulberry32(Math.floor(Math.random() * 2 ** 31)));
      post({ type: "pair", pieces: [decode(candidates[0].slice(0, -1)), decode(candidates[1].slice(0, -1))] });
    } catch { post({ type: "failed" }); }
    return;
  }

  if (!judge) return;
  if (request.type === "sample") {
    post({ type: "sample", piece: decode(compose(judge.policy, PIECE_STEPS, 0.7, mulberry32(Math.floor(Math.random() * 2 ** 31)))) });
    return;
  }
  if (request.type === "pair") {
    candidates = judge.pair(mulberry32(request.seed));
    post({ type: "pair", pieces: [decode(candidates[0].slice(0, -1)), decode(candidates[1].slice(0, -1))] });
    return;
  }
  if (request.type === "choose" && candidates) {
    const [a, b] = candidates;
    judge.choose(request.winner === 0 ? a : b, request.winner === 0 ? b : a);
    // The next pair first, so the reader can listen while the numbers are worked out.
    candidates = judge.pair(mulberry32(Math.floor(Math.random() * 2 ** 31)));
    post({ type: "pair", pieces: [decode(candidates[0].slice(0, -1)), decode(candidates[1].slice(0, -1))] });
    post({ type: "judged", choices: judge.choices, now: measure(judge.policy), before: before! });
  }
};
