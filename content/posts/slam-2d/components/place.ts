/**
 * "Have I seen this view before?" — appearance-based place recognition on one-row panoramas.
 * Two panoramas taken at the same spot facing different ways are the same picture shifted sideways, so compare
 * them at every shift: the best score says how alike the places look, the best shift says how the headings differ.
 */
export interface Resemblance {
  /** Normalised correlation at the best shift, −1…1. */
  score: number;
  /** Heading of the second view relative to the first, radians. */
  heading: number;
}

export function resemblance(a: Float64Array, b: Float64Array): Resemblance {
  const n = a.length, za = standardise(a), zb = standardise(b);
  let best = -Infinity, at = 0;
  for (let shift = 0; shift < n; shift++) {
    let dot = 0;
    for (let i = 0; i < n; i++) dot += za[i] * zb[(i + shift) % n];
    if (dot > best) { best = dot; at = shift; }
  }
  // b[(i + shift)] lines up with a[i]: what a sees at beam i, b sees at beam i + shift, so b is turned by −shift beams.
  const turn = (-at / n) * 2 * Math.PI;
  return { score: best / n, heading: Math.atan2(Math.sin(turn), Math.cos(turn)) };
}

/** Blur a little first (fine detail shifts with every step you take; the broad pattern does not), then zero mean, unit variance. */
function standardise(raw: Float64Array): Float64Array {
  const n = raw.length, v = new Float64Array(n);
  for (let i = 0; i < n; i++) for (let d = -3; d <= 3; d++) v[i] += raw[(i + d + n) % n] / 7;
  let mean = 0;
  for (const x of v) mean += x;
  mean /= v.length;
  let sd = 0;
  for (const x of v) sd += (x - mean) ** 2;
  sd = Math.sqrt(sd / v.length) || 1;
  return v.map((x) => (x - mean) / sd);
}
