import type { Params } from "./params";
import type { Action } from "./types";

export type Option = { action: Action; place: number; need: number; travelMinutes: number; current: boolean };

/** need² − distanceCost × travel hours, plus a bonus for carrying on with what you are already doing. */
export function utility(option: Option, params: Params): number {
  return option.need ** 2 - params.distanceCost * (option.travelMinutes / 60) + (option.current ? params.stayBonus : 0);
}

/**
 * Whether an action is on the table at all: its need is past the threshold, or the person is already doing it and the
 * need is not yet down to `doneAt`. Without that second half people leave the table after one bite.
 */
export function eligible(need: number, index: number, current: boolean, params: Params): boolean {
  return need > params.threshold[index] || (current && need > params.doneAt);
}

/** The best option, or null when there is none: then the person idles. Ties go to the earlier option. */
export function choose(options: Option[], params: Params): Option | null {
  let best: Option | null = null, bestU = -Infinity;
  for (const option of options) {
    const u = utility(option, params);
    if (u > bestU) { bestU = u; best = option; }
  }
  return best;
}
