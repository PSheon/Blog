"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Piece } from "./music";
import type { Reply, Request } from "./protocol";
import type { Timbre } from "./synth";
import { createMusicWorker } from "./worker-factory";

/*
 * One synthesiser worker and one AudioContext for the page, shared by every figure: playing something stops whatever
 * was playing. The worker is separate from the training one, so a note never waits behind a training step. The
 * AudioContext is made on the first press of Play (a browser only lets a page make sound after a gesture).
 */
let synth: Worker | null = null, audio: AudioContext | null = null, source: AudioBufferSourceNode | null = null;
/** Fires when the music itself ends, a little before the buffer does: the reverb tail rings on, the controls do not wait for it. */
let endTimer: ReturnType<typeof setTimeout> | null = null;
let nextId = 0, current: { key: string; started: number; seconds: number } | null = null;
/** What is playing, kept so that changing the timbre can re-render the same piece at once. */
let last: { key: string; piece: Piece } | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

function worker(): Worker {
  synth ??= createMusicWorker();
  return synth;
}

export function stopAll() {
  if (endTimer) { clearTimeout(endTimer); endTimer = null; }
  source?.stop();
  source = null;
  current = null;
  changed();
}

/** Counts the figures using the player: when the last one goes (the reader navigated away), the sound stops with it. */
let users = 0;

export function useStopOnLeave() {
  useEffect(() => {
    users++;
    return () => {
      if (--users > 0) return;
      stopAll();
      synth?.terminate();
      synth = null;
      void audio?.close();
      audio = null;
    };
  }, []);
}

/** Swap the timbre of what is playing without going back to the beginning. Silence stays silent. */
export function restyle(timbre: Timbre) {
  const at = current && current.started >= 0 && audio ? audio.currentTime - current.started : 0;
  if (last && current) void play(last.key, last.piece, timbre, at);
}

async function play(key: string, piece: Piece, timbre: Timbre, offset = 0) {
  // Changing the timbre of what is already playing keeps the old sound going until the new one is ready, so the
  // music does not stop for the second or so the synthesiser takes. Anything else stops at once.
  const swap = current?.key === key && !!source;
  const previous = source;
  if (!swap) stopAll();
  last = { key, piece };
  audio ??= new AudioContext();
  if (audio.state === "suspended") await audio.resume();
  const id = ++nextId, w = worker();
  current = { key, started: -1, seconds: 0 };
  changed();
  const reply = await new Promise<Extract<Reply, { type: "audio" }>>((resolve) => {
    const on = ({ data }: MessageEvent<Reply>) => { if (data.type === "audio" && data.id === id) { w.removeEventListener("message", on); resolve(data); } };
    w.addEventListener("message", on);
    w.postMessage({ type: "render", id, piece, timbre } satisfies Request);
  });
  if (current?.key !== key || id !== nextId || !audio) return; // something else was asked for meanwhile
  const buffer = audio.createBuffer(2, reply.left.length, 44100);
  buffer.copyToChannel(reply.left as Float32Array<ArrayBuffer>, 0);
  buffer.copyToChannel(reply.right as Float32Array<ArrayBuffer>, 1);
  if (swap && previous) { previous.onended = null; previous.stop(); if (source === previous) source = null; }
  const node = audio.createBufferSource();
  node.buffer = buffer;
  node.connect(audio.destination);
  node.onended = () => { if (source === node) { source = null; current = null; changed(); } };
  node.start(0, Math.max(0, Math.min(offset, buffer.duration - 0.05)));
  source = node;
  current = { key, started: audio.currentTime - offset, seconds: reply.seconds };
  // The buffer carries three seconds of reverb after the last note. Count the piece as played when the music ends
  // (plus a moment), or Play stays "Stop" for several silent seconds.
  if (endTimer) clearTimeout(endTimer);
  endTimer = setTimeout(() => { endTimer = null; current = null; changed(); }, Math.max(0, reply.seconds + 0.8 - offset) * 1000);
  changed();
}

/** Which key is playing (or being prepared), and a function for how far through it is (0–1, or null before it starts). */
export function usePlayer() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  const progress = useCallback(() => (current && current.started >= 0 && audio ? Math.min(1, (audio.currentTime - current.started) / current.seconds) : null), []);
  return { playing: current?.key ?? null, play, stop: stopAll, restyle, progress };
}

/** Moves a playhead while `key` plays: calls `draw` every frame with the fraction played, and with null when it stops. */
export function usePlayhead(key: string, draw: (fraction: number | null) => void) {
  const { playing, progress } = usePlayer();
  const drawRef = useRef(draw);
  useEffect(() => { drawRef.current = draw; });
  useEffect(() => {
    if (playing !== key) { drawRef.current(null); return; }
    let frame = 0;
    const tick = () => { drawRef.current(progress()); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, key, progress]);
}
