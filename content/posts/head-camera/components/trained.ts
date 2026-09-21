import { useSyncExternalStore } from "react";
import { Policy, type Saved } from "./model";

/** The model the reader trained in fig. 02, if any, so the bench in fig. 01 can drive with it. Lives as long as the page. */
let mine: Policy | null = null;
const listeners = new Set<() => void>();

export function setMine(saved: Saved) {
  mine = new Policy(saved);
  listeners.forEach((l) => l());
}

export function useMine(): Policy | null {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => mine, () => null);
}
