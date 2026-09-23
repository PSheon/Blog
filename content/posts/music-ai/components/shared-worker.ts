"use client";

import { useEffect, useRef, useState } from "react";
import type { Reply, Request } from "./protocol";
import { createMusicWorker } from "./worker-factory";

/*
 * Figures 02 and 03 use the same trained composer (judge.bin, 223 KB) and the same chorales, so they share one worker
 * and one copy of both instead of fetching and parsing them twice. Training keeps a worker of its own: it holds the
 * thread for minutes at a time.
 */
let shared: Worker | null = null, users = 0, ids = 0;

/** The shared worker, with `onReply` attached for as long as the component lives. */
export function useSharedWorker(onReply: (reply: Reply) => void): (request: Request) => void {
  // One identity per figure, fixed for its lifetime.
  const [id] = useState(() => ++ids);
  const handler = useRef(onReply);
  useEffect(() => { handler.current = onReply; });
  useEffect(() => {
    users++;
    shared ??= createMusicWorker();
    const listener = ({ data }: MessageEvent<Reply>) => { if (data.from === id) handler.current(data); };
    shared.addEventListener("message", listener);
    const worker = shared;
    return () => {
      worker.removeEventListener("message", listener);
      if (--users === 0) { worker.terminate(); shared = null; }
    };
  }, [id]);
  return (request: Request) => shared?.postMessage({ ...request, from: id });
}
