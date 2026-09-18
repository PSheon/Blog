import { type NextRequest, NextResponse } from "next/server";
import { pickLocale } from "@/lib/i18n/config";

/** The site has no locale-less home: send "/" to the reader's language. */
export function proxy(request: NextRequest) {
  const locale = pickLocale(request.headers.get("accept-language"));
  return NextResponse.redirect(new URL(`/${locale}`, request.url));
}

export const config = { matcher: ["/"] };
