/** Simulated time is minutes since Day 1 00:00. Everything about the sky is a function of the hour; nothing is stored. */

export const hourOf = (t: number): number => ((t / 60) % 24 + 24) % 24;
export const dayOf = (t: number): number => Math.floor(t / 1440) + 1;

/** −1 at midnight, 0 at 06:00 and 18:00, 1 at noon. */
export const sunAltitude = (hour: number): number => Math.sin(((hour - 6) / 24) * 2 * Math.PI);

/** ∫ sunAltitude over [t0, t1] (minutes), in hours. Exact, so stepping minute by minute and jumping ahead agree. */
export function sunIntegral(t0: number, t1: number): number {
  const w = (2 * Math.PI) / 24, phase = (t: number) => (t / 60 - 6) * w;
  return (Math.cos(phase(t0)) - Math.cos(phase(t1))) / w;
}

/** "Day 2 07:40" */
export function formatTime(t: number): string {
  const m = Math.floor(t) % 1440, pad = (v: number) => String(v).padStart(2, "0");
  return `Day ${dayOf(t)} ${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/**
 * Whether a building's windows are lit: they come on from 18:30 with a per-building delay of up to 90 minutes and
 * go out between 23:00 and 01:00, building by building. `hash` is any number in [0, 1) fixed per building.
 */
export function windowsLit(hour: number, hash: number): boolean {
  const h = hour < 12 ? hour + 24 : hour;
  return h >= 18.5 + hash * 1.5 && h < 23 + ((hash * 7.13) % 1) * 2;
}

/** Hours of [t0, t1) (minutes) that fall inside the daily window [from, to) (hours). */
export function hoursInWindow(t0: number, t1: number, from: number, to: number): number {
  let total = 0;
  for (let day = Math.floor(t0 / 1440); day * 1440 < t1; day++) {
    const a = Math.max(t0, day * 1440 + from * 60), b = Math.min(t1, day * 1440 + to * 60);
    if (b > a) total += b - a;
  }
  return total / 60;
}
