import { getAllPosts, getPostMeta } from "@/lib/content/posts";
import { isLocale, locales } from "@/lib/i18n";
import { ogSize, renderCard } from "@/lib/og/render";

export const size = ogSize;
export const contentType = "image/png";
export const alt = "paul.notebook";

export function generateStaticParams() {
  return locales.flatMap((locale) => getAllPosts(locale).map((p) => ({ locale, slug: p.slug })));
}

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const post = isLocale(locale) ? getPostMeta(slug, locale) : null;
  if (!post) return new Response("Not found", { status: 404 });
  return renderCard({
    eyebrow: `№ ${String(post.no).padStart(3, "0")}`,
    title: post.title,
    description: post.description,
    tags: post.tags,
    fallbackTitle: getPostMeta(slug, "en")?.isFallback === false ? getPostMeta(slug, "en")!.title : slug,
  });
}
