/** Viewfinder corners, as on the camera frame in the profile banner. Purely decorative. */
export function CornerMarks() {
  const base = "pointer-events-none absolute size-2.5 border-signal/70";
  return (
    <span aria-hidden>
      <span className={`${base} -top-px -left-px border-t border-l`} />
      <span className={`${base} -top-px -right-px border-t border-r`} />
      <span className={`${base} -bottom-px -left-px border-b border-l`} />
      <span className={`${base} -right-px -bottom-px border-r border-b`} />
    </span>
  );
}
