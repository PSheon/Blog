"use client";

import dynamic from "next/dynamic";

/*
 * The article's instruments, loaded as one chunk of their own. Every article is rendered by the same route, and Next
 * hands a route the client code of everything it can render, so with plain re-exports here each article shipped
 * every other article's instruments as well. The split only happens when a client file does the lazy import. Server
 * rendering stays on, so the figures are in the HTML. The chunk is asked for as soon as this module runs (only the
 * article being read runs its own), not when React reaches the first figure: until it arrives the controls are
 * drawn but do nothing.
 */
const loading = typeof window === "undefined" ? null : import("./labs");
const labs = () => loading ?? import("./labs");

export const FieldLab = dynamic(() => labs().then((m) => m.FieldLab));
export const GuidanceLab = dynamic(() => labs().then((m) => m.GuidanceLab));
export const NoiseLab = dynamic(() => labs().then((m) => m.NoiseLab));
export const StepsLab = dynamic(() => labs().then((m) => m.StepsLab));
export const TrainLab = dynamic(() => labs().then((m) => m.TrainLab));
