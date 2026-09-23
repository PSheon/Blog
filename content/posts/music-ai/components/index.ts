"use client";

import dynamic from "next/dynamic";

/* The article's instruments as one lazy chunk: see content/posts/slam-2d/components/index.ts for why it is done this way. */
const loading = typeof window === "undefined" ? null : import("./labs");
const labs = () => loading ?? import("./labs");

export const ComposerLab = dynamic(() => labs().then((m) => m.ComposerLab));
export const JudgeLab = dynamic(() => labs().then((m) => m.JudgeLab));
export const BlindLab = dynamic(() => labs().then((m) => m.BlindLab));
