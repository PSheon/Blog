// Article 014's data files, from the chorales convert.py writes and a checkpoint train.ts saves:
//
//   npx tsx scripts/music/pack.ts <chorales.json> <model.json>
//
//   public/posts/music-ai/chorales.bin  u16 train count, u16 validation count, u16 length per chorale, then one
//                                       byte per token (training chorales first). Bach, Craig Sapp's edition,
//                                       CC BY-NC-SA 4.0 — so is this file.
//   public/posts/music-ai/judge.bin     float32 parameters in the Transformer's own order, for figures 02 and 03.
//
// The corpus, the research scripts and the runs live outside this repo (docs/research/music-ai explains where).
import fs from "node:fs";
import path from "node:path";
import { Transformer, mulberry32 } from "@/lib/ml";
import { CONFIG, HOLD, LO, REST } from "@/content/posts/music-ai/components/music";

interface Chorale { pitches: number[][]; onset: number[][] }

const [source, checkpoint] = process.argv.slice(2);
if (!source || !checkpoint) throw new Error("usage: pack.ts <chorales.json> <model.json>");
const out = path.join(process.cwd(), "public/posts/music-ai");
fs.mkdirSync(out, { recursive: true });

/** One token per voice per eighth: a new note is its pitch, a held one HOLD, silence REST. */
function tokens(c: Chorale): number[] {
  const ids: number[] = [];
  c.pitches.forEach((step, t) => step.forEach((p, v) => ids.push(p < 0 ? REST : c.onset[t][v] || t === 0 ? p - LO : HOLD)));
  return ids;
}

// The same seeded split the research used: 90 % to train on, 10 % kept back.
const chorales: Chorale[] = JSON.parse(fs.readFileSync(source, "utf8"));
const rng = mulberry32(2026);
const order = chorales.map((_, i) => i).sort(() => rng() - 0.5);
const nVal = Math.round(chorales.length * 0.1);
const val = order.slice(0, nVal).map((i) => tokens(chorales[i]));
const train = order.slice(nVal).map((i) => tokens(chorales[i]));

const all = [...train, ...val];
const bytes = all.reduce((n, t) => n + t.length, 0);
const buffer = Buffer.alloc(4 + 2 * all.length + bytes);
buffer.writeUInt16LE(train.length, 0);
buffer.writeUInt16LE(val.length, 2);
all.forEach((t, i) => buffer.writeUInt16LE(t.length, 4 + 2 * i));
let at = 4 + 2 * all.length;
for (const t of all) for (const id of t) buffer[at++] = id;
fs.writeFileSync(`${out}/chorales.bin`, buffer);

// The checkpoint is a map of parameter name to numbers; the page reads them in the Transformer's own order.
const saved: Record<string, number[]> = JSON.parse(fs.readFileSync(checkpoint, "utf8"));
const model = new Transformer(CONFIG);
const weights = new Float32Array(model.parameterCount());
let k = 0;
for (const name of Object.keys(model.params)) for (const x of saved[name]) weights[k++] = x;
fs.writeFileSync(`${out}/judge.bin`, Buffer.from(weights.buffer));

console.log(`${train.length} + ${val.length} chorales, ${bytes} tokens, ${buffer.length} bytes; ${weights.length} parameters, ${weights.byteLength} bytes`);
