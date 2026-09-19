/** The ways section 5 breaks the car. `healthy` is the opener's own setting. */
export type PresetId = "healthy" | "noClosure" | "drift" | "camera" | "wrong";

export interface Preset {
  drift: number;
  loopClosure: boolean;
  camera: boolean;
  /** Add one deliberately wrong loop closure once the map is otherwise healthy. */
  wrong: boolean;
}

export const PRESETS: Record<PresetId, Preset> = {
  healthy: { drift: 0.006, loopClosure: true, camera: false, wrong: false },
  noClosure: { drift: 0.006, loopClosure: false, camera: false, wrong: false },
  drift: { drift: 0.02, loopClosure: true, camera: false, wrong: false },
  camera: { drift: 0.02, loopClosure: true, camera: true, wrong: false },
  wrong: { drift: 0.006, loopClosure: true, camera: false, wrong: true },
};

type Listener = (id: PresetId) => void;
const listeners = new Set<Listener>();

/** Section 5's cards ask the driving instrument at the top of the article to take a setting. */
export function applyPreset(id: PresetId) {
  listeners.forEach((l) => l(id));
}
export function onPreset(listener: Listener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
