import { describe, expect, it } from "vitest";
import { LENGTH, SEP, TASKS, Trainer, example } from "@/content/posts/transformer-from-scratch/components/task";
import { mulberry32 } from "@/lib/ml";

describe("sequence tasks", () => {
  it("defines reverse, copy and sort", () => {
    expect(TASKS.reverse([3, 1, 4])).toEqual([4, 1, 3]);
    expect(TASKS.copy([3, 1, 4])).toEqual([3, 1, 4]);
    expect(TASKS.sort([3, 1, 4, 1])).toEqual([1, 1, 3, 4]);
  });

  it("scores only the answer half of an example", () => {
    const { ids, targets } = example([3, 1, 4, 1, 5, 9], "reverse");
    expect(ids).toEqual([3, 1, 4, 1, 5, 9, SEP, 9, 5, 1, 4, 1]);
    // positions 0–5 would have to guess random digits or SEP: ignored
    expect(targets).toEqual([-1, -1, -1, -1, -1, -1, 9, 5, 1, 4, 1, 3]);
  });
});

describe("Trainer", () => {
  const trainer = new Trainer("reverse", mulberry32(1));
  const before = trainer.accuracy(30);
  for (let i = 0; i < 200; i++) trainer.step();

  it("starts out guessing", () => {
    expect(before).toBeLessThan(0.1);
  });

  it("learns to reverse within 200 steps", () => {
    expect(trainer.losses[0]).toBeGreaterThan(2);
    expect(trainer.losses.at(-1)!).toBeLessThan(0.05);
    expect(trainer.accuracy(60)).toBeGreaterThanOrEqual(0.98);
    expect(trainer.generate([3, 1, 4, 1, 5, 9]).output).toEqual([9, 5, 1, 4, 1, 3]);
  });

  it("grows an anti-diagonal in one attention head, as the article claims", () => {
    const { attention, tokens } = trainer.generate([3, 1, 4, 1, 5, 9]);
    const T = tokens.length;
    const mirrored = attention[0].map((map) => {
      let hits = 0;
      for (let i = 0; i < LENGTH; i++) {
        const row = LENGTH + i; // the position that produces answer digit i
        let best = 0;
        for (let c = 1; c <= row; c++) if (map[row * T + c] > map[row * T + best]) best = c;
        if (best === LENGTH - 1 - i) hits++;
      }
      return hits;
    });
    expect(Math.max(...mirrored)).toBe(LENGTH);
  });
});
