"use client";

import { useSyncExternalStore } from "react";

/**
 * Which of the hero's four stations is showing. The hero instrument and the rail under it are separate components in
 * a server-rendered page, so they share this instead of a parent's state: choosing a stop on the rail changes the
 * instrument above it, and the rail shows which one is on.
 */
export type StationKey = "see" | "think" | "generate" | "act";
export const STATION_KEYS: StationKey[] = ["see", "think", "generate", "act"];

let active: StationKey = "see";
const listeners = new Set<() => void>();

export function setStation(next: StationKey) {
  if (next === active) return;
  active = next;
  listeners.forEach((listener) => listener());
}

export function useStation(): StationKey {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => active,
    () => "see",
  );
}
