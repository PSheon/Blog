import { describe, expect, it } from "vitest";
import { Mlp, Population, mulberry32, weightCount } from "@/lib/ml";

describe("Mlp", () => {
  it("counts weights for a bias-free perceptron", () => {
    expect(weightCount([2, 2, 1])).toBe(2 * 2 + 2 * 1);
    expect(weightCount([30, 16, 3])).toBe(30 * 16 + 16 * 3);
  });

  it("rejects a weight vector of the wrong length", () => {
    expect(() => new Mlp([2, 2, 1], new Float32Array(5))).toThrow(/6/);
  });

  it("computes a sigmoid forward pass, layer by layer", () => {
    // hidden0 = σ(1·1 + 0·2) , hidden1 = σ(0·1 + 1·2), out = σ(1·h0 − 1·h1)
    const net = new Mlp([2, 2, 1], Float32Array.from([1, 0, 0, 1, 1, -1]));
    const s = (x: number) => 1 / (1 + Math.exp(-x));
    const [out] = net.forward([1, 2]);
    expect(out).toBeCloseTo(s(s(1) - s(2)), 6);
    expect(net.activations.map((l) => l.length)).toEqual([2, 2, 1]);
  });

  it("supports relu hidden layers with a linear output", () => {
    const net = new Mlp([1, 2, 2], Float32Array.from([1, -1, 1, 0, 0, 1]), "relu");
    expect(Array.from(net.forward([3]))).toEqual([3, 0]);
    expect(Array.from(net.forward([-3]))).toEqual([0, 3]);
  });
});

describe("Population", () => {
  const options = { shape: [2, 2, 1], size: 10, rng: mulberry32(1) };

  it("starts with random genomes in [-1, 1)", () => {
    const pop = new Population(options);
    expect(pop.genomes).toHaveLength(10);
    expect(pop.generation).toBe(1);
    for (const g of pop.genomes) for (const w of g) expect(Math.abs(w)).toBeLessThanOrEqual(1);
  });

  it("falls back to defaults when an option is passed as undefined", () => {
    const pop = new Population({ shape: [2, 2, 1], size: 4, rng: undefined, mutationRate: undefined });
    expect(pop.genomes).toHaveLength(4);
    expect(() => pop.evolve([1, 2, 3, 4])).not.toThrow();
  });

  it("is reproducible for a given seed", () => {
    const a = new Population({ ...options, rng: mulberry32(7) });
    const b = new Population({ ...options, rng: mulberry32(7) });
    expect(a.genomes.map((g) => Array.from(g))).toEqual(b.genomes.map((g) => Array.from(g)));
  });

  it("keeps the elite unchanged, best first", () => {
    const pop = new Population({ ...options, elitism: 0.2 });
    const before = pop.genomes.map((g) => Array.from(g));
    // genome 3 is best, genome 8 second
    const scores = [0, 1, 2, 99, 3, 4, 5, 6, 50, 7];
    pop.evolve(scores);
    expect(pop.generation).toBe(2);
    expect(pop.genomes).toHaveLength(10);
    expect(Array.from(pop.genomes[0])).toEqual(before[3]);
    expect(Array.from(pop.genomes[1])).toEqual(before[8]);
  });

  it("does not alias parents: mutating a child leaves the elite intact", () => {
    const pop = new Population(options);
    pop.evolve(pop.genomes.map((_, i) => i));
    const elite = Array.from(pop.genomes[0]);
    pop.genomes[5].fill(123);
    expect(Array.from(pop.genomes[0])).toEqual(elite);
  });

  it("breeds children only from their two parents' genes when mutation is off", () => {
    const pop = new Population({ ...options, elitism: 0.2, randomRate: 0, mutationRate: 0 });
    const scores = pop.genomes.map((_, i) => 10 - i);
    const parents = pop.genomes.slice(0, 10).map((g) => Array.from(g));
    pop.evolve(scores);
    for (const child of pop.genomes.slice(2)) {
      child.forEach((w, i) => expect(parents.some((p) => p[i] === w)).toBe(true));
    }
  });

  it("rejects a score list of the wrong length", () => {
    expect(() => new Population(options).evolve([1, 2, 3])).toThrow(/10/);
  });

  it("actually optimises: evolves weights toward a target", () => {
    const pop = new Population({ shape: [1, 1, 1], size: 40, rng: mulberry32(3) });
    const fitness = (g: Float32Array) => -Math.abs(g[0] - 0.5) - Math.abs(g[1] + 0.25);
    const best = () => Math.max(...pop.genomes.map(fitness));
    const start = best();
    for (let i = 0; i < 40; i++) pop.evolve(pop.genomes.map(fitness));
    expect(best()).toBeGreaterThan(start);
    expect(best()).toBeGreaterThan(-0.05);
  });
});
