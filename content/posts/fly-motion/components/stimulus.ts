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

export function randomClip(rng: Rng, directions = 4): Clip {
  const label = Math.floor(rng() * directions), angle = (label * 2 * Math.PI) / directions;
  return { label, angle, frames: grating(angle, 4 + rng() * 4, 1 + rng() * 3, rng() * 2 * Math.PI) };
}
