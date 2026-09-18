import type { Rng, TapList } from "@/lib/ml";
import kernels from "./wiring.json";

/**
 * The motion pathway of one fruit fly's right optic lobe, reduced from the FlyEM male CNS connectome
 * (v1.0, CC-BY, https://male-cns.janelia.org): for each pair of cell types, how many synapses a source
 * cell sitting (du, dv) columns away makes onto one target cell, averaged over ~890 columns.
 * See docs/research/2026-09-18-fly-connectome-spike.md for how wiring.json was made.
 */
export const TYPES = ["L1", "L2", "L3", "Mi1", "Tm3", "Mi4", "Mi9", "Tm1", "Tm2", "Tm4", "Tm9", "C3", "T4a", "T4b", "T4c", "T4d", "T5a", "T5b", "T5c", "T5d"] as const;
export type CellType = (typeof TYPES)[number];
/** The lamina cells that photoreceptors talk to; the stimulus is injected here. */
export const INPUTS = 3;
/** The direction-selective cells the readout listens to. */
export const OUTPUTS = { start: 12, count: 8 };
/** Predicted transmitter per type in the same dataset: GABA (Mi4, C3) and glutamate (L1, Mi9) inhibit, acetylcholine excites. */
const INHIBITORY = new Set<CellType>(["L1", "Mi9", "Mi4", "C3"]);

export type Wiring = "real" | "symmetric" | "shuffled";

export interface Compiled {
  taps: TapList;
  /** "source>target" for each learned gain, in the order tapConv expects. */
  pairs: string[];
}

/**
 * Lattice rows follow the dataset's first hex axis (u) and columns the second (v).
 * "symmetric" averages every kernel with its point reflection, which removes all direction information but
 * keeps who talks to whom and how much. "shuffled" keeps each pair's synapse counts and scrambles their offsets.
 */
export function compile(wiring: Wiring = "real", rng: Rng = Math.random): Compiled {
  const index = new Map(TYPES.map((t, i) => [t as string, i]));
  const pairs = Object.keys(kernels);
  const rows: { src: number; dst: number; dr: number; dc: number; n: number; pair: number }[] = [];
  pairs.forEach((name, pair) => {
    const [a, b] = name.split(">");
    let list = (kernels as unknown as Record<string, [number, number, number][]>)[name].map(([du, dv, n]) => ({ du, dv, n }));
    if (wiring === "symmetric") {
      const merged = new Map<string, { du: number; dv: number; n: number }>();
      for (const { du, dv, n } of list)
        for (const s of [1, -1]) {
          const key = `${s * du},${s * dv}`, at = merged.get(key) ?? { du: s * du, dv: s * dv, n: 0 };
          at.n += n / 2;
          merged.set(key, at);
        }
      list = [...merged.values()];
    }
    if (wiring === "shuffled") {
      const counts = list.map((t) => t.n);
      for (let i = counts.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [counts[i], counts[j]] = [counts[j], counts[i]];
      }
      list = list.map((t, i) => ({ ...t, n: counts[i] }));
    }
    const sign = INHIBITORY.has(a as CellType) ? -1 : 1;
    for (const { du, dv, n } of list) rows.push({ src: index.get(a)!, dst: index.get(b)!, dr: du, dc: dv, n: sign * n, pair });
  });
  // Scale each target's inputs to sum to one synapse-equivalent, so a gain of 1 is a sensible starting point for every type.
  const total = new Float64Array(TYPES.length);
  for (const r of rows) total[r.dst] += Math.abs(r.n);
  return {
    pairs,
    taps: {
      src: Int32Array.from(rows, (r) => r.src),
      dst: Int32Array.from(rows, (r) => r.dst),
      dr: Int32Array.from(rows, (r) => r.dr),
      dc: Int32Array.from(rows, (r) => r.dc),
      weight: Float64Array.from(rows, (r) => r.n / Math.max(1, total[r.dst])),
      pair: Int32Array.from(rows, (r) => r.pair),
    },
  };
}

/** Eye coordinates of a column: the two hex axes are the eye's diagonals. */
export const columnX = (u: number, v: number) => ((u - v) * Math.sqrt(3)) / 2;
export const columnY = (u: number, v: number) => (u + v) / 2;
