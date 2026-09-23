"use client";

import dynamic from "next/dynamic";

/* The article's instruments as one lazy chunk: see content/posts/slam-2d/components/index.ts for why. */
const loading = typeof window === "undefined" ? null : import("./labs");
const labs = () => loading ?? import("./labs");

export const LanderLab = dynamic(() => labs().then((m) => m.LanderLab));
