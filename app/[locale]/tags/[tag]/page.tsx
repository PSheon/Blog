import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/site/page-header";
import { PostIndex } from "@/components/site/post-index";
import { getAllPosts, getAllTags } from "@/lib/content/posts";
import { toRows } from "@/lib/content/rows";
import { getDictionary, isLocale, locales } from "@/lib/i18n";
import { sharedMetadata } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.flatMap((locale) => getAllTags(locale).map(({ tag }) => ({ locale, tag })));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/tags/[tag]">): Promise<Metadata> {
  const { locale, tag } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale), posts = getAllPosts(locale).filter((p) => p.tags.includes(tag));
  return { title: t.tags.tagged(tag), description: t.tags.taggedLead(tag, posts.length), ...sharedMetadata(locale, `/tags/${tag}`, { siteCard: true }) };
}

export default async function TagPage({ params }: PageProps<"/[locale]/tags/[tag]">) {
  const { locale, tag } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const posts = getAllPosts(locale).filter((p) => p.tags.includes(tag));
  if (posts.length === 0) notFound();
  return (
    <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
      <PageHeader title={`#${tag}`} lead={t.tags.count(posts.length)}>
        <Link href={`/${locale}/tags`} className="mt-4 inline-flex min-h-6 items-center text-sm text-signal underline-offset-4 hover:underline">
          {t.tags.title}
        </Link>
      </PageHeader>
      <PostIndex
        locale={locale}
        rows={toRows(posts, locale)}
        tags={[]}
        filterable={false}
        labels={{ all: t.home.all, empty: t.home.empty, interactive: t.post.interactive, filter: t.nav.tags }}
      />
    </div>
  );
}
