"use client";

import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";

const KEYS: Record<string, [number, number]> = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, 1], s: [0, -1], a: [-1, 0], d: [1, 0] };

interface Props {
  label: string;
  hintId?: string;
  /** x: −1 (left) … 1 (right), y: −1 (back) … 1 (forward). Called with (0, 0) on release. */
  onChange(x: number, y: number): void;
  testId?: string;
}

/** A thumb stick: drag it, or focus it and use the arrow keys / WASD. Springs back to the centre when let go. */
export function Stick({ label, hintId, onChange, testId }: Props) {
  const [at, setAt] = useState<[number, number]>([0, 0]);
  const held = useRef(new Set<string>());
  const move = (x: number, y: number) => { setAt([x, y]); onChange(x, y); };

  const drag = (e: PointerEvent<HTMLDivElement>) => {
    if (e.type !== "pointerdown" && !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    if (e.type === "pointerdown") e.currentTarget.setPointerCapture(e.pointerId);
    const box = e.currentTarget.getBoundingClientRect();
    let x = ((e.clientX - box.left) / box.width) * 2 - 1, y = 1 - ((e.clientY - box.top) / box.height) * 2;
    const r = Math.hypot(x, y);
    if (r > 1) { x /= r; y /= r; }
    move(x, y);
  };
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!(key in KEYS)) return;
    e.preventDefault();
    if (e.type === "keydown") held.current.add(key); else held.current.delete(key);
    let x = 0, y = 0;
    held.current.forEach((k) => { x += KEYS[k][0]; y += KEYS[k][1]; });
    move(Math.sign(x), Math.sign(y));
  };
  const release = () => { held.current.clear(); move(0, 0); };

  return (
    <div
      role="application"
      tabIndex={0}
      aria-label={label}
      aria-describedby={hintId}
      className="relative size-32 shrink-0 touch-none rounded-full border border-border bg-background outline-none select-none focus-visible:ring-2 focus-visible:ring-ring"
      onPointerDown={drag}
      onPointerMove={drag}
      onPointerUp={release}
      onPointerCancel={release}
      onKeyDown={keys}
      onKeyUp={keys}
      onBlur={release}
      data-testid={testId}
    >
      <span className="absolute top-1/2 right-3 left-3 h-px bg-border" aria-hidden />
      <span className="absolute top-3 bottom-3 left-1/2 w-px bg-border" aria-hidden />
      <span className="absolute size-9 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal shadow" style={{ left: `${50 + at[0] * 36}%`, top: `${50 - at[1] * 36}%` }} aria-hidden />
    </div>
  );
}
