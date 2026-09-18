/**
 * Canonical origin, used by RSS, the sitemap and metadata.
 * An explicit NEXT_PUBLIC_SITE_URL wins (set it once a custom domain is attached); otherwise use
 * the production domain Vercel assigns; otherwise we are running locally.
 */
const origin =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const site = {
  name: "paul.notebook",
  author: "Paul Jiang",
  url: origin.replace(/\/$/, ""),
  github: "https://github.com/PSheon",
  repo: "https://github.com/PSheon/Blog",
} as const;

export function editUrl(slug: string, locale: string): string {
  return `${site.repo}/edit/main/content/posts/${slug}/${locale}.mdx`;
}
