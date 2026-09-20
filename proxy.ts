import { type NextRequest, NextResponse } from "next/server";
import { pickLocale } from "@/lib/i18n/config";

/**
 * "/" has no page of its own: send it to the reader's language. Every other path that reaches here starts with
 * something that is not a locale. One segment ("/foo") already gets app/global-not-found.tsx; deeper ones
 * ("/foo/bar") match [locale]/[...rest], fail in the root layout and used to get Next's bare white 404 — rewrite
 * them onto a one-segment path so they share the site's own page. The status stays 404.
 */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/") {
    const locale = pickLocale(request.headers.get("accept-language"));
    return NextResponse.redirect(new URL(`/${locale}`, request.url));
  }
  return NextResponse.rewrite(new URL("/not-found", request.url));
}

// Not /zh or /en, not Next's or Vercel's own paths, not files (anything with a dot), not the extension-less icon route.
export const config = { matcher: ["/", "/((?!zh(?:/|$)|en(?:/|$)|_next/|_vercel/|apple-icon|.*\\..*)[^/]+/.+)"] };
