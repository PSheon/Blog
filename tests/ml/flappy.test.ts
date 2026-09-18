import { describe, expect, it } from "vitest";
import { FlappyWorld, WORLD } from "@/content/posts/ai-flappy-bird/components/world";
import { mulberry32 } from "@/lib/ml";

describe("FlappyWorld", () => {
  it("starts a generation with every bird alive", () => {
    const world = new FlappyWorld({ rng: mulberry32(1) });
    expect(world.birds).toHaveLength(50);
    expect(world.alive).toBe(50);
    expect(world.generation).toBe(1);
  });

  it("spawns a pipe pair with a gap that fits inside the field", () => {
    const world = new FlappyWorld({ rng: mulberry32(2) });
    world.step();
    expect(world.pipes).toHaveLength(1);
    const { gapY } = world.pipes[0];
    expect(gapY).toBeGreaterThanOrEqual(WORLD.margin);
    expect(gapY + WORLD.gap).toBeLessThanOrEqual(WORLD.height - WORLD.margin);
  });

  it("kills birds that leave the field and moves on to the next generation", () => {
    const world = new FlappyWorld({ rng: mulberry32(3), size: 4 });
    // Zero weights → σ(0) = 0.5, never above the flap threshold: every bird just falls.
    world.population.genomes.forEach((g) => g.fill(0));
    let steps = 0;
    while (world.generation === 1 && steps < 500) {
      world.step();
      steps++;
    }
    expect(world.generation).toBe(2);
    expect(world.alive).toBe(4);
    expect(world.history).toHaveLength(1);
    expect(world.history[0]).toBe(0);
  });

  it("counts a pipe once the flock is past it", () => {
    const world = new FlappyWorld({ rng: mulberry32(11) });
    while (world.generation <= 40 && world.passed === 0) world.step();
    expect(world.passed).toBe(1);
    expect(world.best).toBe(1);
  });

  it("learns: a flock graduates within 40 generations, then a new one starts", () => {
    const world = new FlappyWorld({ rng: mulberry32(11) });
    while (world.generation <= 40 && !world.history.includes(WORLD.graduateAt)) world.step();
    expect(world.history[0]).toBeLessThan(3);
    expect(world.history.at(-1)).toBe(WORLD.graduateAt);
    expect(world.best).toBe(WORLD.graduateAt);
    expect(world.passed).toBe(0);
    expect(world.alive).toBe(50);
  });
});
