"use client"; // Error boundaries must be Client Components

import "./globals.css";
import { fontVariables } from "./fonts";

/**
 * Replaces the root layout when the layout itself throws, so it brings its own document, styles and fonts.
 * No theme provider survives up here: it uses the site's default, dark. Both languages, since the locale
 * may be what failed to resolve.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="zh-Hant-TW" className={`${fontVariables} dark antialiased`}>
      <body className="flex min-h-dvh flex-col">
        <title>Error — paul.notebook</title>
        <main className="mx-auto grid w-full max-w-7xl place-items-start gap-5 px-5 py-24 sm:px-8">
          <p className="font-mono text-sm text-signal-2">error{error.digest ? ` · ${error.digest}` : ""}</p>
          <h1 className="font-heading text-4xl font-semibold">網站出了點問題 / Something went wrong</h1>
          <p className="font-serif text-lg text-muted-foreground">可以再試一次，或回到首頁。Try again, or go back home.</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => retry()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              再試一次 / Try again
            </button>
            {/* A full page load on purpose: the router above this boundary is what broke. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="rounded-md border border-border px-4 py-2 text-sm font-medium">
              回到首頁 / Home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
