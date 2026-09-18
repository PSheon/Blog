import {
  Instrument_Sans,
  JetBrains_Mono,
  Noto_Sans_TC,
  Noto_Serif_TC,
  Source_Serif_4,
} from "next/font/google";

// Prose and headings share one serif; instruments speak in mono; chrome in a quiet sans.
const body = Source_Serif_4({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const ui = Instrument_Sans({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const code = JetBrains_Mono({ subsets: ["latin"], variable: "--font-code", display: "swap" });

// CJK faces are sliced by unicode-range, so only the glyphs a page uses are fetched.
const bodyTc = Noto_Serif_TC({
  weight: ["400", "600", "700"],
  variable: "--font-body-tc",
  display: "swap",
  preload: false,
});
const uiTc = Noto_Sans_TC({
  weight: ["400", "500", "700"],
  variable: "--font-ui-tc",
  display: "swap",
  preload: false,
});

export const fontVariables = [body, ui, code, bodyTc, uiTc].map((f) => f.variable).join(" ");
