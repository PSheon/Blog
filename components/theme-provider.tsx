"use client";

import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { type ComponentProps, useEffect } from "react";

/** The two page backgrounds, and the only place they are written down outside globals.css. */
const THEME_COLOR = { dark: "#070918", light: "#fbfbfe" } as const;

/**
 * Keep `<meta name="theme-color">` on the theme the READER chose.
 *
 * It used to be declared in `viewport` with `prefers-color-scheme` media queries, which answers a different
 * question: the theme here is a class next-themes puts on <html>, and the default is dark whatever the OS says. So
 * a first-time visitor on a light phone got a dark page under a white browser bar, and anyone who had picked the
 * opposite of their OS got the two reversed (measured by paul-8b, three of the six combinations wrong).
 */
function ThemeColor() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    const colour = THEME_COLOR[resolvedTheme === "light" ? "light" : "dark"];
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    // Any media-qualified tags left by the framework would still win on a matching OS, so they go.
    for (const tag of document.querySelectorAll('meta[name="theme-color"][media]')) tag.remove();
    meta.content = colour;
  }, [resolvedTheme]);
  return null;
}

/**
 * Change the theme with a fade rather than a cut.
 *
 * `html.theme-fade` (globals.css) lets every element interpolate its colours; it goes on just before the class that
 * actually changes them and comes off when the fade is done. A reader who asked for less motion gets the old
 * instant swap.
 */
export function useThemeFade() {
  const { setTheme } = useTheme();
  return (next: string) => {
    const root = document.documentElement;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) { setTheme(next); return; }
    root.classList.add("theme-fade");
    setTheme(next);
    window.setTimeout(() => root.classList.remove("theme-fade"), 320);
  };
}

export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider {...props}>
      <ThemeColor />
      {props.children}
    </NextThemesProvider>
  );
}
