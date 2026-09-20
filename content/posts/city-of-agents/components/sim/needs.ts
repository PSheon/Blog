import { hourOf, sunIntegral } from "./clock";
import type { Params } from "./params";
import { ACTIONS, type Action, type Needs } from "./types";

export const needOf = (action: Action): number => ACTIONS.indexOf(action);

/**
 * One step of `hours`. Every need grows at the person's own rate; the one the current action relieves also falls at the
 * recovery rate, which is the faster of the two. Duty grows only in duty hours, and not at all when it is switched off;
 * fatigue grows faster at night.
 */
export function stepNeeds(needs: Needs, rates: Needs, acting: Action | null, t: number, hours: number, params: Params, dutyOn: boolean): void {
  const hour = hourOf(t), relieved = acting ? needOf(acting) : -1;
  for (let i = 0; i < 4; i++) {
    if (i === 3 && !dutyOn) { needs[i] = 0; continue; }
    const grows = i !== 3 || (hour >= params.dutyHours[0] && hour < params.dutyHours[1]);
    // Fatigue follows the sun: it builds faster after dark (the exact integral, so a replay can jump ahead).
    const span = i === 0 ? hours - params.circadian * sunIntegral(t, t + hours * 60) : hours;
    needs[i] = Math.min(1, Math.max(0, needs[i] + (grows ? rates[i] * span : 0) - (i === relieved ? params.recovery[i] * hours : 0)));
  }
}
