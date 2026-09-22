import type { Saved, XY } from "./model";

export type Request = { type: "start"; seed: number } | { type: "stop" };
export type Reply =
  | { type: "probe"; bytes: Uint8Array }
  | { type: "progress"; step: number; steps: number; loss: number; seconds: number; keypoints: XY[] }
  | { type: "testing" }
  | { type: "done"; saved: Saved; seconds: number; straight: number; pitched: number; episodes: number };
