import { describe, expect, it } from "vitest";
import { countOperators } from "@/lib/content/ml-stats";
import { Tape } from "@/lib/ml/autograd";

describe("countOperators", () => {
  it("counts real operators and leaves the tape's plumbing out", () => {
    const n = countOperators();
    // 23 differentiable + 7 inference ops. It was 33 until the three ops of the dropped fly-connectome article went
    // (no published article used them). It may grow; it must not quietly shrink.
    expect(n).toBeGreaterThanOrEqual(30);
    expect(typeof (Tape.prototype as unknown as Record<string, unknown>).matmul).toBe("function");
    // If a private helper is added to Tape, add it to NOT_OPS: every counted name must be an op taking matrices.
    const helpers = Object.getOwnPropertyNames(Tape.prototype).filter((k) => ["constructor", "backward", "record"].includes(k));
    expect(helpers).toHaveLength(3);
  });
});
