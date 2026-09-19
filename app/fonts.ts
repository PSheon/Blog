import { Instrument_Sans, JetBrains_Mono, Source_Serif_4 } from "next/font/google";

// Prose and headings share one serif; instruments speak in mono; chrome in a quiet sans.
const body = Source_Serif_4({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const ui = Instrument_Sans({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
// Labels and code only: not worth a place among the preloaded fonts that compete with the first paint.
const code = JetBrains_Mono({ subsets: ["latin"], variable: "--font-code", display: "swap", preload: false });

/*
 * Chinese is set in the reader's system fonts on purpose (see the stacks in globals.css).
 * Noto Serif TC + Noto Sans TC as web fonts cost ~2 MB in unicode-range slices plus ~220 KB of
 * render-blocking @font-face CSS: measured FCP went from 14 s to under 2 s on throttled 4G
 * when they were removed. Latin web fonts are tens of kilobytes and carry the page's character.
 */
export const fontVariables = [body, ui, code].map((f) => f.variable).join(" ");
