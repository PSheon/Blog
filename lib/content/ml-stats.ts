import { Tape } from "@/lib/ml/autograd";
import * as forward from "@/lib/ml/ops";

/** Tape methods that are plumbing, not operators. */
const NOT_OPS = new Set(["constructor", "backward", "record"]);

/**
 * How many operators lib/ml implements by hand, counted from the code itself so the home page cannot go stale:
 * every differentiable op on the autodiff `Tape` (each has a forward and a hand-derived backward pass) plus the
 * inference-only ops in ops.ts. Server-side only — it pulls in the whole library to count it.
 */
export function countOperators(): number {
  const differentiable = Object.getOwnPropertyNames(Tape.prototype).filter((name) => !NOT_OPS.has(name)).length;
  const inference = Object.values(forward).filter((v) => typeof v === "function").length;
  return differentiable + inference;
}
