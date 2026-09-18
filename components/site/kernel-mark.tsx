/** The site's mark: a 3×3 kernel, centre tap lit. */
export function KernelMark({ className }: { className?: string }) {
  const cells = [0.25, 0.55, 0.25, 0.55, 1, 0.55, 0.25, 0.55, 0.25];
  return (
    <svg viewBox="0 0 15 15" aria-hidden className={className}>
      {cells.map((o, i) => (
        <rect
          key={i}
          x={(i % 3) * 5.5}
          y={Math.floor(i / 3) * 5.5}
          width="4"
          height="4"
          fill="var(--signal)"
          opacity={o}
        />
      ))}
    </svg>
  );
}
