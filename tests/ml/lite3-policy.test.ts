import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { elu, tensor } from "@/lib/ml";
import { Policy, gravityInBody } from "@/content/posts/lite3-walking/components/policy";
import golden from "../fixtures/lite3-policy.json";

describe("elu", () => {
  it("is the identity above zero and α(eˣ − 1) below", () => {
    const y = elu(tensor([2, 0, -1, -30], [4]));
    expect(y.data[0]).toBe(2);
    expect(y.data[1]).toBe(0);
    expect(y.data[2]).toBeCloseTo(Math.expm1(-1), 6);
    expect(y.data[3]).toBeCloseTo(-1, 6);
    expect(elu(tensor([-1], [1]), 0.5).data[0]).toBeCloseTo(0.5 * Math.expm1(-1), 6);
  });
});

describe("Lite3 policy", () => {
  const file = readFileSync("public/lite3/policy.f32");
  const policy = new Policy(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));

  it("reproduces the reference actions recorded from the ONNX model", () => {
    for (const { obs, action } of golden.pairs) {
      const got = policy.act(Float32Array.from(obs));
      action.forEach((want, i) => expect(got[i]).toBeCloseTo(want, 4));
    }
  });

  it("rejects a weight file of the wrong size", () => {
    expect(() => new Policy(new ArrayBuffer(16))).toThrow(/weights/);
  });
});

describe("gravityInBody", () => {
  it("points straight down when level and sideways when rolled 90°", () => {
    expect(gravityInBody(1, 0, 0, 0)).toEqual([-0, -0, -1]);
    const [gx, gy, gz] = gravityInBody(Math.SQRT1_2, Math.SQRT1_2, 0, 0); // +90° about x
    expect(gx).toBeCloseTo(0, 6);
    expect(gy).toBeCloseTo(-1, 6);
    expect(gz).toBeCloseTo(0, 6);
  });
});
