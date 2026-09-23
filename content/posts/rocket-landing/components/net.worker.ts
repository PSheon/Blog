/// <reference lib="webworker" />
import { mulberry32 } from "@/lib/ml";
import { teach, type NetProgress } from "./net";
import type { Gains } from "./pilot";

/** Teaching the network takes about ten seconds; the page stays usable because it happens here. */
export type TeachRequest = { type: "teach"; teacher: Gains; seed: number };
export type TeachReply = { type: "progress"; progress: NetProgress } | { type: "done" };

self.onmessage = ({ data }: MessageEvent<TeachRequest>) => {
  const post = (reply: TeachReply) => (self as unknown as Worker).postMessage(reply);
  for (const progress of teach(data.teacher, mulberry32(data.seed))) post({ type: "progress", progress });
  post({ type: "done" });
};
