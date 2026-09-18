"use client";

import { useEffect } from "react";

/**
 * Display maths scrolls sideways on narrow screens. KaTeX's markup doesn't pass through our MDX
 * components, so make those scroll regions keyboard-reachable here (WCAG 2.1.1) — but only the
 * ones that actually overflow, so wide screens don't gain pointless tab stops.
 */
export function ScrollableMath({ label }: { label: string }) {
  useEffect(() => {
    const blocks = [...document.querySelectorAll<HTMLElement>(".prose-notebook .katex-display")];
    const update = () => {
      for (const el of blocks) {
        if (el.scrollWidth > el.clientWidth + 1) {
          el.tabIndex = 0;
          el.setAttribute("role", "group");
          el.setAttribute("aria-label", label);
        } else {
          el.removeAttribute("tabindex");
          el.removeAttribute("role");
          el.removeAttribute("aria-label");
        }
      }
    };
    update();
    const ro = new ResizeObserver(update);
    blocks.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [label]);
  return null;
}
