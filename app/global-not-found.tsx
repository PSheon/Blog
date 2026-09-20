import type { Metadata } from "next";
import "./globals.css";
import { fontVariables } from "./fonts";
import NotFound from "./[locale]/not-found";

/**
 * URLs outside /zh and /en match no route at all (the root layout lives under the [locale] segment), and
 * used to get Next's bare 404. This one skips the layout, so it carries its own document. The theme is read
 * the way next-themes stores it; with nothing stored, the site's default (dark) applies.
 */
export const metadata: Metadata = { title: "404 — paul.notebook", robots: { index: false } };

const theme = `try{var t=localStorage.getItem("theme"),l=t==="light"||(t==="system"&&matchMedia("(prefers-color-scheme: light)").matches);document.documentElement.classList.toggle("dark",!l)}catch(e){}`;

export default function GlobalNotFound() {
  return (
    <html lang="zh-Hant-TW" className={`${fontVariables} dark antialiased`} suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col">
        <script dangerouslySetInnerHTML={{ __html: theme }} />
        <main className="flex-1">
          <NotFound />
        </main>
      </body>
    </html>
  );
}
