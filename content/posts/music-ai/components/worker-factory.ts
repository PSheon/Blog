/**
 * The one place a music worker is made. Turbopack wires `new Worker(new URL(…))` at build time, and three separate
 * call sites for the same worker file left the production bundle with "Missing worker bootstrap config": in
 * development every figure worked, in a production build none of them did.
 */
export const createMusicWorker = () => new Worker(new URL("./music.worker.ts", import.meta.url), { type: "module" });
