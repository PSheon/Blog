export const site = {
  name: "paul.notebook",
  author: "Paul Jiang",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://blog.psheon.dev",
  github: "https://github.com/PSheon",
  repo: "https://github.com/PSheon/Blog",
} as const;

export function editUrl(slug: string, locale: string): string {
  return `${site.repo}/edit/main/content/posts/${slug}/${locale}.mdx`;
}
