"use client";

import dynamic from "next/dynamic";

/* The article's instruments as one lazy chunk: see content/posts/slam-2d/components/index.ts for why it is done this way. */
const loading = typeof window === "undefined" ? null : import("./labs");
const labs = () => loading ?? import("./labs");

export const BouncesLab = dynamic(() => labs().then((m) => m.BouncesLab));
export const BvhLab = dynamic(() => labs().then((m) => m.BvhLab));
export const ConvergeLab = dynamic(() => labs().then((m) => m.ConvergeLab));
export const PathLab = dynamic(() => labs().then((m) => m.PathLab));
export const MaterialLab = dynamic(() => labs().then((m) => m.MaterialLab));
