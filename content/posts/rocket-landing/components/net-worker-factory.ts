/** The one place the teaching worker is made: three call sites for one worker file broke the production bundle in
 * article 014, and this article follows the same rule. */
export const createNetWorker = () => new Worker(new URL("./net.worker.ts", import.meta.url), { type: "module" });
