import { notFound } from "next/navigation";

/**
 * Anything under /zh or /en that no other route matches. Without this, such URLs fall through to Next's bare
 * default 404, outside the site's layout; with it they get `not-found.tsx` with the header, footer and theme.
 */
export default function CatchAll() {
  notFound();
}
