import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/site/page-header";
import { PostIndex } from "@/components/site/post-index";
import { getAllPosts, getAllTags } from "@/lib/content/posts";
import { toRows } from "@/lib/content/rows";
import { getDictionary, isLocale } from "@/lib/i18n";
import { sharedMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/posts">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return { title: t.posts.title, description: t.posts.description, ...sharedMetadata(locale, "/posts", { siteCard: true }) };
}

export default async function PostsPage({ params }: PageProps<"/[locale]/posts">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  return (
    <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
      <PageHeader title={t.posts.title} lead={t.posts.lead} />
      <PostIndex
        locale={locale}
        rows={toRows(getAllPosts(locale), locale)}
        tags={getAllTags(locale).map((x) => x.tag)}
        labels={{ all: t.home.all, empty: t.home.empty, interactive: t.post.interactive, filter: t.nav.tags }}
      />
    </div>
  );
}
