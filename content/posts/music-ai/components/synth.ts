import type { Piece } from "./music";

/*
 * The instrument the model's scores are played on, computed sample by sample (no Web Audio oscillators or effects):
 * three soft voices, a damped stereo reverb laid out like Freeverb, and a gentle low-pass on the mix. The first
 * version was an organ of five harmonics with a fast attack and an undamped echo; Paul found it sharp, and it had
 * 14 dB more energy in the 1–4 kHz band the ear is most sensitive to (docs/research/music-ai, "Timbre").
 */
export type Timbre = "pad" | "epiano" | "flute";
export const TIMBRES: Timbre[] = ["pad", "epiano", "flute"];
export const SAMPLE_RATE = 44100;
export const BPM = 60;
/** Seconds per step: an eighth note at 60 beats a minute. */
export const STEP_SECONDS = 60 / BPM / 2;

export interface Audio { left: Float32Array; right: Float32Array; seconds: number }

function noise(seed: number) {
  let a = seed | 0;
  return () => { a = (Math.imul(a, 1664525) + 1013904223) | 0; return a / 2147483648; };
}

/** One note into the two channels. Lower voices sit a little louder; the four are spread across the stereo field. */
function note(L: Float32Array, R: Float32Array, timbre: Timbre, midi: number, start: number, dur: number, voice: number) {
  const f = 440 * 2 ** ((midi - 69) / 12);
  const level = [0.5, 0.55, 0.6, 0.75][voice], pan = [0.35, 0.6, 0.4, 0.5][voice];
  const gl = Math.cos((pan * Math.PI) / 2), gr = Math.sin((pan * Math.PI) / 2);
  const rnd = noise(midi * 131 + Math.round(start * 1000));
  const attack = timbre === "pad" ? 0.35 : timbre === "flute" ? 0.12 : 0.008;
  const release = timbre === "pad" ? 1.4 : timbre === "flute" ? 0.35 : 1.2;
  const total = Math.round((dur + release) * SAMPLE_RATE), a0 = Math.round(start * SAMPLE_RATE);
  const w = 2 * Math.PI * f, detune = 2 ** (4 / 1200);
  let breath = 0;
  for (let i = 0; i < total && a0 + i < L.length; i++) {
    const t = i / SAMPLE_RATE;
    const sustain = t < dur ? 1 : Math.exp(-(t - dur) / (release / 4));
    let env: number, x: number;
    if (timbre === "pad") {
      // The fundamental and a soft octave, each doubled 4 cents apart: the slow beating between them is the warmth.
      env = Math.min(1, t / attack) ** 2 * sustain;
      x = 0.5 * (Math.sin(w * t) + Math.sin(w * detune * t)) + 0.12 * (Math.sin(2 * w * t) + Math.sin((2 * w * t) / detune)) + 0.03 * Math.sin(3 * w * t);
    } else if (timbre === "flute") {
      // A sine with a little second harmonic, a breath of noise on the attack, and a vibrato that fades in.
      env = Math.min(1, t / attack) * sustain;
      const vib = 1 + 0.003 * Math.sin(2 * Math.PI * 4.8 * t) * Math.min(1, t / 0.6);
      breath = 0.97 * breath + 0.03 * rnd();
      x = Math.sin(w * vib * t) + 0.08 * Math.sin(2 * w * vib * t) + 3 * breath * Math.exp(-t / 0.08);
    } else {
      // An electric piano by two-operator FM: the modulation index decays, so the tone rounds off as it sounds.
      env = Math.min(1, t / attack) * Math.exp(-t / 2.2) * sustain;
      x = Math.sin(w * t + 1.1 * Math.exp(-t / 0.35) * Math.sin(w * t));
    }
    const s = 0.16 * level * env * x;
    L[a0 + i] += s * gl;
    R[a0 + i] += s * gr;
  }
}

/** Freeverb's layout: eight feedback combs with a low-pass inside the loop (the tail darkens as it decays), four all-passes. */
function reverb(L: Float32Array, R: Float32Array, room = 0.84, damp = 0.45, wet = 0.32) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], passes = [556, 441, 341, 225];
  const side = (input: Float32Array, spread: number) => {
    const out = new Float32Array(input.length);
    for (const d0 of combs) {
      const d = d0 + spread, buf = new Float32Array(d);
      let idx = 0, store = 0;
      for (let i = 0; i < input.length; i++) {
        const y = buf[idx];
        store = y * (1 - damp) + store * damp;
        buf[idx] = input[i] * 0.015 + store * room;
        out[i] += y;
        if (++idx === d) idx = 0;
      }
    }
    for (const d0 of passes) {
      const d = d0 + spread, buf = new Float32Array(d);
      let idx = 0;
      for (let i = 0; i < out.length; i++) {
        const b = buf[idx], x = out[i];
        out[i] = b - x;
        buf[idx] = x + b * 0.5;
        if (++idx === d) idx = 0;
      }
    }
    return out;
  };
  const wl = side(L, 0), wr = side(R, 23);
  for (let i = 0; i < L.length; i++) {
    L[i] = L[i] * (1 - wet) + wl[i] * wet * 3;
    R[i] = R[i] * (1 - wet) + wr[i] * wet * 3;
  }
}

/** Two one-pole low-passes: 12 dB per octave above `hz`. */
function lowpass(x: Float32Array, hz: number) {
  const a = Math.exp((-2 * Math.PI * hz) / SAMPLE_RATE);
  for (let pass = 0; pass < 2; pass++) {
    let y = 0;
    for (let i = 0; i < x.length; i++) x[i] = y = (1 - a) * x[i] + a * y;
  }
}

export function render({ pitches, onset }: Piece, timbre: Timbre): Audio {
  const seconds = pitches.length * STEP_SECONDS;
  const n = Math.ceil((seconds + 3) * SAMPLE_RATE);
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let v = 0; v < 4; v++) {
    for (let t = 0; t < pitches.length; ) {
      const p = pitches[t][v];
      if (p < 0) { t++; continue; }
      let len = 1;
      while (t + len < pitches.length && pitches[t + len][v] === p && !onset[t + len][v]) len++;
      note(L, R, timbre, p, t * STEP_SECONDS, len * STEP_SECONDS, v);
      t += len;
    }
  }
  reverb(L, R);
  lowpass(L, 3200);
  lowpass(R, 3200);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = 0.7 / (peak || 1);
  for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
  return { left: L, right: R, seconds };
}
