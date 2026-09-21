"use client";

import dynamic from "next/dynamic";

/* The article's instruments as one lazy chunk: see content/posts/slam-2d/components/index.ts for why it is done this way. */
const loading = typeof window === "undefined" ? null : import("./labs");
const labs = () => loading ?? import("./labs");

export const TrainLab = dynamic(() => labs().then((m) => m.TrainLab));
export const OffsetLab = dynamic(() => labs().then((m) => m.OffsetLab));
export const KeypointsLab = dynamic(() => labs().then((m) => m.KeypointsLab));
export const PickLab = dynamic(() => labs().then((m) => m.PickLab));
