/**
 * Run something only while `el` is on screen and the tab is in front (DESIGN §2): `start` when both become true,
 * `stop` when either stops being. Returns the cleanup. An observer's batch can carry "out" and then "in"; the last
 * entry is the state now, the first is not.
 */
export function runWhenSeen(el: Element, start: () => void, stop: () => void): () => void {
  let visible = false, running = false;
  const settle = () => {
    const want = visible && !document.hidden;
    if (want && !running) { running = true; start(); } else if (!want && running) { running = false; stop(); }
  };
  const seen = new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; settle(); });
  seen.observe(el);
  document.addEventListener("visibilitychange", settle);
  return () => { seen.disconnect(); document.removeEventListener("visibilitychange", settle); if (running) stop(); };
}
