import { type FlappyWorld, WORLD } from "./world";

export interface Palette {
  signal: string;
  pink: string;
  violet: string;
  fg: string;
  muted: string;
  rule: string;
  panel: string;
}

export function readPalette(el: Element): Palette {
  const css = getComputedStyle(el);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    signal: v("--signal"),
    pink: v("--signal-2"),
    violet: v("--signal-3"),
    fg: v("--foreground"),
    muted: v("--muted-foreground"),
    rule: v("--rule"),
    panel: v("--panel"),
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * Draw the world as a bench instrument rather than a game: pipes are outlined
 * obstacles, the flock is a faint cloud, and only the leader is drawn solid.
 */
export function draw(ctx: CanvasRenderingContext2D, world: FlappyWorld, p: Palette, scale: number) {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, WORLD.width, WORLD.height);

  // Pipes
  ctx.lineWidth = 1;
  for (const pipe of world.pipes) {
    ctx.fillStyle = p.panel;
    ctx.strokeStyle = p.rule;
    for (const [y, h] of [
      [-2, pipe.gapY + 2],
      [pipe.gapY + WORLD.gap, WORLD.height - pipe.gapY - WORLD.gap + 2],
    ]) {
      ctx.fillRect(pipe.x, y, WORLD.pipeW, h);
      ctx.strokeRect(pipe.x + 0.5, y + 0.5, WORLD.pipeW - 1, h - 1);
    }
    // The opening is what the network is told about, so it gets the accent.
    ctx.strokeStyle = p.violet;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pipe.x, pipe.gapY);
    ctx.lineTo(pipe.x + WORLD.pipeW, pipe.gapY);
    ctx.moveTo(pipe.x, pipe.gapY + WORLD.gap);
    ctx.lineTo(pipe.x + WORLD.pipeW, pipe.gapY + WORLD.gap);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  // The flock
  const leader = world.leader;
  ctx.fillStyle = p.signal;
  for (const bird of world.birds) {
    if (!bird.alive || bird === leader) continue;
    ctx.globalAlpha = 0.16;
    roundRect(ctx, WORLD.birdX, bird.y, WORLD.birdW, WORLD.birdH, 8);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (leader) {
    const tilt = Math.max(-0.5, Math.min(0.9, leader.vy / 10));
    ctx.save();
    ctx.translate(WORLD.birdX + WORLD.birdW / 2, leader.y + WORLD.birdH / 2);
    ctx.rotate(tilt);
    ctx.fillStyle = p.signal;
    roundRect(ctx, -WORLD.birdW / 2, -WORLD.birdH / 2, WORLD.birdW, WORLD.birdH, 9);
    ctx.fill();
    // wing, beak, eye
    ctx.fillStyle = leader.flapped ? p.fg : p.violet;
    roundRect(ctx, -11, leader.flapped ? -9 : 0, 15, 8, 4);
    ctx.fill();
    ctx.fillStyle = p.pink;
    ctx.beginPath();
    ctx.moveTo(WORLD.birdW / 2 - 2, -4);
    ctx.lineTo(WORLD.birdW / 2 + 8, 0);
    ctx.lineTo(WORLD.birdW / 2 - 2, 5);
    ctx.fill();
    ctx.fillStyle = p.panel;
    ctx.beginPath();
    ctx.arc(8, -4, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Guide from the leader to the opening it is aiming for
    const next = world.pipes.find((q) => q.x + WORLD.pipeW > WORLD.birdX);
    if (next) {
      ctx.strokeStyle = p.violet;
      ctx.globalAlpha = 0.55;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(WORLD.birdX + WORLD.birdW, leader.y + WORLD.birdH / 2);
      ctx.lineTo(next.x, next.gapY + WORLD.gap / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }
}
