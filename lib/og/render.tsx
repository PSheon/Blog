import "server-only";
import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

export const ogSize = { width: 1200, height: 630 };

/**
 * Fetch just the glyphs we need. Satori (next/og) cannot read woff2 and has no CJK fallback, and a
 * full Noto Sans TC is ~7 MB; Google Fonts' `text=` parameter returns a subset of a few kilobytes,
 * as TrueType when the request carries no modern User-Agent.
 */
async function subsetFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  const once = async () => {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&text=${encodeURIComponent(text)}`,
    ).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`fonts.googleapis.com answered ${r.status}`))));
    const url = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css)?.[1];
    if (!url) throw new Error("no TrueType source in the stylesheet Google Fonts returned");
    return fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`font file answered ${r.status}`))));
  };
  // One blip on the way to Google Fonts used to cost a Chinese article its share card without a word: the card fell
  // back to the English title, the build stayed green, and nobody knew until a link was shared. So: three tries, and
  // then say so. On a production deployment the build fails instead (the previous deployment stays up), because a
  // wrong card on the live site is worse than a deploy that has to be run again.
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await once();
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  const message = `[og] could not fetch the ${family} ${weight} subset after 3 tries: ${last instanceof Error ? last.message : String(last)}`;
  if (process.env.VERCEL_ENV === "production") throw new Error(message);
  console.warn(`${message}. The card falls back to Latin text.`);
  return null;
}

interface Card {
  /** e.g. "№ 001" — omitted on the site card. */
  eyebrow?: string;
  title: string;
  description: string;
  tags?: string[];
  /** Latin-only text to fall back on if the CJK subset cannot be fetched at build time. */
  fallbackTitle?: string;
}

const KERNEL = [0.25, 0.55, 0.25, 0.55, 1, 0.55, 0.25, 0.55, 0.25];

/** The share card: the notebook's navy, the profile's cyan→violet→pink sweep, the 3×3 kernel mark. */
export async function renderCard({ eyebrow, title, description, tags = [], fallbackTitle }: Card) {
  const text = `${eyebrow ?? ""}${title}${description}${tags.join("")}${site.name}#№`;
  const [bold, regular] = await Promise.all([
    subsetFont("Noto+Sans+TC", 700, text),
    subsetFont("Noto+Sans+TC", 400, text),
  ]);
  const hasCjkFont = bold !== null && regular !== null;
  const needsCjk = /[　-鿿＀-￯]/.test(title + description);
  // Never ship tofu: without the font, show the Latin fallback (or nothing) instead of boxes.
  const shownTitle = hasCjkFont || !needsCjk ? title : (fallbackTitle ?? site.name);
  const shownDescription = hasCjkFont || !needsCjk ? description : "";
  // A CJK glyph is about twice as wide as a Latin letter; measure the text in "Latin widths".
  const width = (t: string) => [...t].reduce((n, ch) => n + (/[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1), 0);
  const clip = (t: string, max: number) => {
    let used = 0, out = "";
    for (const ch of t) {
      used += width(ch);
      if (used > max) return `${out.trimEnd()}…`;
      out += ch;
    }
    return out;
  };
  const titleSize = width(shownTitle) > 60 ? 50 : width(shownTitle) > 36 ? 58 : 70;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px 72px",
          color: "#e9eaf6",
          backgroundColor: "#070918",
          backgroundImage:
            "radial-gradient(circle at 8% 0%, rgba(121,218,250,0.20), transparent 45%), radial-gradient(circle at 100% 10%, rgba(255,110,150,0.20), transparent 50%)",
          fontFamily: "Noto Sans TC",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexWrap: "wrap", width: 45, height: 45 }}>
              {KERNEL.map((o, i) => (
                <div key={i} style={{ width: 11, height: 11, margin: 2, backgroundColor: "#79dafa", opacity: o }} />
              ))}
            </div>
            <div style={{ marginLeft: 18, fontSize: 30 }}>{site.name}</div>
          </div>
          {eyebrow && <div style={{ fontSize: 28, color: "#79dafa" }}>{eyebrow}</div>}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: titleSize,
              fontWeight: 700,
              lineHeight: 1.22,
              letterSpacing: -1,
              backgroundImage: "linear-gradient(100deg, #79dafa 0%, #b9a5ff 55%, #ff6e96 100%)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {shownTitle}
          </div>
          {shownDescription && (
            <div style={{ marginTop: 26, fontSize: 28, lineHeight: 1.5, color: "#9b9bc4", maxWidth: 980 }}>
              {clip(shownDescription, 132)}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 24, color: "#9b9bc4" }}>
          <div style={{ display: "flex" }}>
            {tags.slice(0, 4).map((tag) => (
              <div key={tag} style={{ marginRight: 20 }}>{`#${tag}`}</div>
            ))}
          </div>
          <div style={{ display: "flex", width: 220, height: 4, backgroundImage: "linear-gradient(90deg, #79dafa, #b9a5ff, #ff6e96)" }} />
        </div>
      </div>
    ),
    {
      ...ogSize,
      fonts: hasCjkFont
        ? [
            { name: "Noto Sans TC", data: bold, weight: 700, style: "normal" },
            { name: "Noto Sans TC", data: regular, weight: 400, style: "normal" },
          ]
        : undefined,
    },
  );
}
