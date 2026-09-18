import { Mlp, Population, type Rng } from "@/lib/ml";

/** Field geometry and physics, in the world's own units (the canvas scales them). */
export const WORLD = {
  width: 380,
  height: 410,
  birdX: 80,
  birdW: 34,
  birdH: 24,
  gravity: 0.3,
  flap: -6,
  pipeW: 50,
  pipeSpeed: 3,
  gap: 120,
  margin: 50,
  spawnEvery: 90,
  /** A flock that clears this many pipes has nothing left to prove; breed the next one. */
  graduateAt: 100,
} as const;

export const BRAIN_SHAPE = [2, 2, 1];

export interface Bird {
  y: number;
  vy: number;
  alive: boolean;
  brain: Mlp;
  /** Last decision, kept for drawing. */
  flapped: boolean;
}

export interface Pipe {
  x: number;
  /** Top of the opening. */
  gapY: number;
  passed: boolean;
}

interface Options {
  size?: number;
  rng?: Rng;
}

/**
 * The whole experiment, free of any rendering: a flock of birds, each steered by a
 * 2-2-1 network, scored by how many ticks it survives, and bred when the last one dies.
 */
export class FlappyWorld {
  readonly population: Population;
  birds: Bird[] = [];
  pipes: Pipe[] = [];
  /** Ticks survived this generation — the fitness. */
  score = 0;
  /** Pipes cleared this generation — the number people care about. */
  passed = 0;
  best = 0;
  alive = 0;
  /** Pipes cleared by each finished generation. */
  history: number[] = [];
  private tick = 0;
  private scores: number[] = [];
  private readonly rng: Rng;

  constructor({ size = 50, rng = Math.random }: Options = {}) {
    this.rng = rng;
    this.population = new Population({ shape: BRAIN_SHAPE, size, rng });
    this.spawnFlock();
  }

  get generation(): number {
    return this.population.generation;
  }

  /** The bird to watch: the first one still flying. */
  get leader(): Bird | undefined {
    return this.birds.find((b) => b.alive);
  }

  private spawnFlock() {
    this.birds = this.population.genomes.map((genome) => ({
      y: WORLD.height / 2,
      vy: 0,
      alive: true,
      flapped: false,
      brain: new Mlp(BRAIN_SHAPE, genome),
    }));
    this.scores = new Array(this.birds.length).fill(0);
    this.alive = this.birds.length;
    this.pipes = [];
    this.score = 0;
    this.passed = 0;
    this.tick = 0;
  }

  /** The opening the flock has to get through next, as a fraction of the field height. */
  nextGap(): number {
    const pipe = this.pipes.find((p) => p.x + WORLD.pipeW > WORLD.birdX);
    return pipe ? pipe.gapY / WORLD.height : 0;
  }

  private hits(bird: Bird): boolean {
    if (bird.y >= WORLD.height || bird.y + WORLD.birdH <= 0) return true;
    return this.pipes.some(
      (p) =>
        WORLD.birdX + WORLD.birdW > p.x &&
        WORLD.birdX < p.x + WORLD.pipeW &&
        (bird.y < p.gapY || bird.y + WORLD.birdH > p.gapY + WORLD.gap),
    );
  }

  step() {
    const gap = this.nextGap();
    this.birds.forEach((bird, i) => {
      if (!bird.alive) return;
      // Everything the bird knows: its own height and the height of the next opening.
      const [out] = bird.brain.forward([bird.y / WORLD.height, gap]);
      bird.flapped = out > 0.5;
      if (bird.flapped) bird.vy = WORLD.flap;
      bird.vy += WORLD.gravity;
      bird.y += bird.vy;
      if (this.hits(bird)) {
        bird.alive = false;
        this.alive--;
        this.scores[i] = this.score;
      }
    });

    if (this.alive === 0 || this.passed >= WORLD.graduateAt) {
      // Survivors of a graduating flock all earn the full score.
      this.birds.forEach((bird, i) => bird.alive && (this.scores[i] = this.score));
      this.history.push(this.passed);
      this.population.evolve(this.scores);
      this.spawnFlock();
      return;
    }

    for (const pipe of this.pipes) {
      pipe.x -= WORLD.pipeSpeed;
      if (!pipe.passed && pipe.x + WORLD.pipeW < WORLD.birdX) {
        pipe.passed = true;
        this.passed++;
      }
    }
    this.pipes = this.pipes.filter((p) => p.x + WORLD.pipeW >= 0);
    if (this.tick % WORLD.spawnEvery === 0) {
      const room = WORLD.height - WORLD.margin * 2 - WORLD.gap;
      this.pipes.push({ x: WORLD.width, gapY: Math.round(this.rng() * room) + WORLD.margin, passed: false });
    }
    this.tick++;
    this.score++;
    if (this.passed > this.best) this.best = this.passed;
  }
}
