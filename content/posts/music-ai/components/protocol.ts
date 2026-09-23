import type { Piece, Report } from "./music";
import type { Timbre } from "./synth";

/** One candidate in the blind test: who wrote it is sent with it, and the page keeps it hidden until the reader answers. */
export interface BlindItem { who: "bach" | "ai" | "rules"; piece: Piece; report: Report }

export interface Snapshot {
  step: number;
  seconds: number;
  val: number;
  piece: Piece;
  report: Report;
  /** the longest stretch, in eighth notes, found note for note in one training chorale */
  copied: number;
}

/** Both the judge and the blind test talk to one worker, so every message carries who asked: a reply meant for one figure must not reset the other. */
export type Request = { from?: number } & RequestBody;

type RequestBody =
  | { type: "train"; seed: number; steps: number }
  | { type: "stop" }
  | { type: "render"; id: number; piece: Piece; timbre: Timbre }
  | { type: "judge" }
  | { type: "pair"; seed: number }
  | { type: "choose"; winner: 0 | 1 }
  | { type: "sample" }
  | { type: "blind" };

export type Reply = { from?: number } & ReplyBody;

type ReplyBody =
  | { type: "loading" }
  | { type: "failed" }
  | { type: "progress"; step: number; steps: number; loss: number; seconds: number }
  | { type: "snapshot"; snapshot: Snapshot }
  | { type: "done" }
  | { type: "audio"; id: number; left: Float32Array; right: Float32Array; seconds: number }
  | { type: "ready" }
  | { type: "pair"; pieces: [Piece, Piece] }
  | { type: "judged"; choices: number; now: Report; before: Report }
  | { type: "blind"; items: BlindItem[] }
  | { type: "sample"; piece: Piece };
