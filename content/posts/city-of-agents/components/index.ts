"use client";

import dynamic from "next/dynamic";

/*
 * The article's instruments, loaded as one chunk of their own: see content/posts/slam-2d/components/index.ts for why
 * this has to be a client file doing the lazy import. Server rendering stays on, so the figures are in the HTML.
 */
const loading = typeof window === "undefined" ? null : import("./labs");
const labs = () => loading ?? import("./labs");

export const CityLab = dynamic(() => labs().then((m) => m.CityLab));
export const ModesLab = dynamic(() => labs().then((m) => m.ModesLab));
export const NeedsLab = dynamic(() => labs().then((m) => m.NeedsLab));
export const OverseerLab = dynamic(() => labs().then((m) => m.OverseerLab));
export const UtilityLab = dynamic(() => labs().then((m) => m.UtilityLab));
