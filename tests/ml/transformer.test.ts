import { describe, expect, it } from "vitest";
import { Adam, Tape, Transformer, mulberry32 } from "@/lib/ml";

const tiny = { vocab: 5, ctx: 6, d: 8, heads: 2, layers: 2 };

describe("Transformer", () => {
  it("creates the documented parameters", () => {
    const model = new Transformer(tiny, mulberry32(1));
    const names = Object.keys(model.params);
    expect(names).toContain("tok");
    expect(names).toContain("pos");
    expect(names).toContain("l0.wq");
    expect(names).toContain("l1.w2");
    expect(names).toContain("unembed");
    // tok 5·8 + pos 6·8 + per layer (4·64 attn + 2·8·32 mlp + 32 + 8 biases + 2·16 ln) + final ln 16 + unembed 8·5
    expect(model.parameterCount()).toBe(40 + 48 + 2 * (256 + 512 + 40 + 32) + 16 + 40);
  });

  it("rejects head counts that do not divide the width", () => {
    expect(() => new Transformer({ ...tiny, heads: 3 }, mulberry32(1))).toThrow(/heads/);
  });

  it("is causal: a later token cannot change an earlier prediction", () => {
    const model = new Transformer(tiny, mulberry32(2));
    const a = model.forward(new Tape(), [1, 2, 3, 4]).logits;
    const b = model.forward(new Tape(), [1, 2, 3, 0]).logits;
    for (let i = 0; i < 3 * tiny.vocab; i++) expect(b.data[i]).toBeCloseTo(a.data[i], 12);
    expect(b.data[3 * tiny.vocab]).not.toBeCloseTo(a.data[3 * tiny.vocab], 6);
  });

  it("returns one causal attention map per layer and head", () => {
    const { attention } = new Transformer(tiny, mulberry32(3)).forward(new Tape(), [1, 2, 3]);
    expect(attention).toHaveLength(2);
    expect(attention[0]).toHaveLength(2);
    expect(attention[0][0]).toHaveLength(9);
    expect(attention[0][0][1]).toBe(0); // row 0 cannot see column 1
  });

  it("backpropagates correctly through the whole model", () => {
    const model = new Transformer(tiny, mulberry32(4));
    const ids = [1, 3, 0, 2, 4];
    const targets = [3, 0, -1, 4, 1];
    const loss = () => {
      const tape = new Tape();
      const value = tape.crossEntropy(model.forward(tape, ids).logits, targets);
      return { tape, value };
    };
    model.zeroGrad();
    loss().tape.backward();
    const rng = mulberry32(9);
    for (const [name, p] of Object.entries(model.params)) {
      for (let k = 0; k < 3; k++) {
        const i = Math.floor(rng() * p.data.length);
        const keep = p.data[i];
        p.data[i] = keep + 1e-5;
        const up = loss().value;
        p.data[i] = keep - 1e-5;
        const down = loss().value;
        p.data[i] = keep;
        expect(Math.abs(p.grad[i] - (up - down) / 2e-5), `${name}[${i}]`).toBeLessThan(1e-6);
      }
    }
  });
});

describe("Adam", () => {
  it("moves parameters against the gradient and minimises a quadratic", () => {
    const model = new Transformer(tiny, mulberry32(5));
    const p = model.params.tok;
    const adam = new Adam(model.params);
    for (let step = 0; step < 400; step++) {
      model.zeroGrad();
      for (let i = 0; i < p.data.length; i++) p.grad[i] = 2 * (p.data[i] - 0.5);
      adam.step(0.05);
    }
    for (const v of p.data) expect(v).toBeCloseTo(0.5, 2);
  });
});
