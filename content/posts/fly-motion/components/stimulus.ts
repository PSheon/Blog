import type { Rng } from "@/lib/ml";
import { columnX, columnY } from "./wiring";

export const GRID = 16, STEPS = 30, DT = 0.02;

export interface Clip {
  /** STEPS frames of GRID·GRID luminances in 0…1. */
  frames: Float64Array[];
  /** Index of the direction of motion, out of `directions`. */
  label: number;
  angle: number;
}

/** A sine grating drifting towards `angle` (radians), with wavelength in columns and temporal frequency in Hz. */
export function grating(angle: number, wavelength: number, hz: number, phase: number): Float64Array[] {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return Array.from({ length: STEPS }, (_, k) => {
    const frame = new Float64Array(GRID * GRID);
    for (let u = 0; u < GRID; u++)
      for (let v = 0; v < GRID; v++) {
        const along = columnX(u, v) * cos + columnY(u, v) * sin;
        frame[u * GRID + v] = 0.5 + 0.5 * Math.sin(2 * Math.PI * (along / wavelength - hz * k * DT) + phase);
      }
    return frame;
  });
}

/**
 * A single edge sweeping towards `angle` at `speed` columns per second. An ON edge is light advancing over a dark
 * field, an OFF edge the reverse. The edge is about one column soft and starts `lead` columns before the centre.
 */
export function edge(angle: number, polarity: "on" | "off", speed: number, lead: number): Float64Array[] {
  const cos = Math.cos(angle), sin = Math.sin(angle), mid = (GRID - 1) / 2;
  const cx = columnX(mid, mid), cy = columnY(mid, mid);
  return Array.from({ length: STEPS }, (_, k) => {
    const frame = new Float64Array(GRID * GRID), front = -lead + speed * k * DT;
    for (let u = 0; u < GRID; u++)
      for (let v = 0; v < GRID; v++) {
        const along = (columnX(u, v) - cx) * cos + (columnY(u, v) - cy) * sin;
        const passed = 1 / (1 + Math.exp((along - front) * 3)); // 1 where the edge has already gone by
        frame[u * GRID + v] = 0.1 + 0.8 * (polarity === "on" ? passed : 1 - passed);
      }
    return frame;
  });
}

export type Stimuli = "gratings" | "mixed";

/** `mixed` draws gratings half the time and ON or OFF edges otherwise, so that both polarities carry the label. */
export function randomClip(rng: Rng, directions = 4, stimuli: Stimuli = "gratings"): Clip {
  const label = Math.floor(rng() * directions), angle = (label * 2 * Math.PI) / directions;
  if (stimuli === "mixed" && rng() < 0.5) return { label, angle, frames: edge(angle, rng() < 0.5 ? "on" : "off", 8 + rng() * 12, 3 + rng() * 3) };
  return { label, angle, frames: grating(angle, 4 + rng() * 4, 1 + rng() * 3, rng() * 2 * Math.PI) };
}
