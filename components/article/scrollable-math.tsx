"use client";

import { useEffect } from "react";

/**
 * Display maths, tables and code scroll sideways on narrow screens. KaTeX's markup doesn't pass through our MDX
 * components, so the scroll regions are made keyboard-reachable here (WCAG 2.1.1), but only the ones that actually
 * overflow, so wide screens don't gain pointless tab stops. A region with more to its right says so: `data-more`
 * fades its right edge (globals.css) until it has been scrolled to the end.
 */
export function ScrollableMath({ label, tableLabel, codeLabel }: { label: string; tableLabel: string; codeLabel: string }) {
  useEffect(() => {
    const kinds: [string, string][] = [[".prose-notebook .katex-display", label], [".prose-notebook .table-scroll", tableLabel], [".prose-notebook pre", codeLabel]];
    const blocks = kinds.flatMap(([selector, name]) => [...document.querySelectorAll<HTMLElement>(selector)].map((el) => ({ el, name })));
    const more = (el: HTMLElement) => { el.toggleAttribute("data-more", el.scrollWidth - el.clientWidth - el.scrollLeft > 2); };
    const update = () => {
      for (const { el, name } of blocks) {
        if (el.scrollWidth > el.clientWidth + 1) {
          el.tabIndex = 0;
          el.setAttribute("role", "group");
          el.setAttribute("aria-label", name);
        } else {
          el.removeAttribute("tabindex");
          el.removeAttribute("role");
          el.removeAttribute("aria-label");
        }
        more(el);
      }
    };
    update();
    const ro = new ResizeObserver(update), onScroll = (e: Event) => more(e.currentTarget as HTMLElement);
    blocks.forEach(({ el }) => { ro.observe(el); el.addEventListener("scroll", onScroll, { passive: true }); });
    return () => { ro.disconnect(); blocks.forEach(({ el }) => el.removeEventListener("scroll", onScroll)); };
  }, [label, tableLabel, codeLabel]);
  return null;
}
