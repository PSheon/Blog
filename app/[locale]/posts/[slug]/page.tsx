// Maths styles are only needed where maths is rendered: keep them off the home and listing pages.
import "katex/dist/katex.min.css";
import { Languages } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { type ComponentType, ViewTransition } from "react";
import { PostFooter } from "@/components/article/post-footer";
import { ReadingProgress } from "@/components/article/progress";
import { ScrollableMath } from "@/components/article/scrollable-math";
import { Toc, TocDisclosure } from "@/components/article/toc";
import { EntryNo, InteractiveBadge } from "@/components/site/post-meta";
import { getAdjacentPosts, getAllPosts, getPostMeta, getRelatedPosts, getToc } from "@/lib/content/posts";
import { formatDate, getDictionary, htmlLang, isLocale, locales } from "@/lib/i18n";
import { sharedMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

// An unknown value is rendered on demand and ends in notFound() below (see the note in app/[locale]/layout.tsx).
export const dynamicParams = true;

export function generateStaticParams() {
  return locales.flatMap((locale) => getAllPosts(locale).map((p) => ({ locale, slug: p.slug })));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/posts/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const post = getPostMeta(slug, locale);
  if (!post) return {};
  const shared = sharedMetadata(locale, `/posts/${slug}`, { available: post.availableLocales, canonicalLocale: post.locale });
  const description = post.seoDescription ?? post.description;
  return {
    // The headline on the page can be as long as it likes; search results cut titles at about 60 characters.
    title: post.seoTitle ?? post.title,
    description,
    keywords: post.tags,
    // A fallback page is a copy of the zh article; point search engines at the original.
    alternates: shared.alternates,
    openGraph: {
      ...shared.openGraph,
      type: "article",
      title: post.title,
      description,
      publishedTime: post.date,
      modifiedTime: post.updated ?? post.date,
      authors: [site.author],
      tags: post.tags,
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function PostPage({ params }: PageProps<"/[locale]/posts/[slug]">) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const post = getPostMeta(slug, locale);
  if (!post) notFound();

  const t = getDictionary(locale);
  const toc = getToc(slug, locale);
  const { newer, older } = getAdjacentPosts(slug, locale);
  const { default: Content } = (await import(`@/content/posts/${slug}/${post.locale}.mdx`)) as {
    default: ComponentType;
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.updated ?? post.date,
    inLanguage: htmlLang[post.locale],
    author: { "@type": "Person", name: site.author, url: site.github },
    publisher: { "@type": "Person", name: site.author, url: site.github },
    image: `${site.url}/${post.locale}/posts/${slug}/opengraph-image`,
    keywords: post.tags.join(", "),
    url: `${site.url}/${post.locale}/posts/${slug}`,
    mainEntityOfPage: `${site.url}/${post.locale}/posts/${slug}`,
    isPartOf: { "@type": "Blog", name: site.name, url: `${site.url}/${post.locale}` },
  };

  return (
    <>
      <ReadingProgress />
      <ScrollableMath label={t.post.mathLabel} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <article
        className="mx-auto w-full max-w-7xl px-5 pt-10 sm:px-8 lg:pt-16 xl:grid xl:grid-cols-[13rem_minmax(0,42.5rem)_17rem] xl:gap-x-12"
        style={{ "--margin-w": "17rem", "--margin-gap": "3rem" } as React.CSSProperties}
      >
        <aside className="hidden xl:block">
          <div className="sticky top-24 max-h-[calc(100dvh-8rem)] overflow-y-auto pb-8">
            <Toc items={toc} label={t.post.toc} />
          </div>
        </aside>

        <div className="mx-auto min-w-0 max-w-[42.5rem] xl:col-span-2 xl:mx-0 xl:max-w-none">
          {post.draft && (
            // Only ever rendered by `next dev`: a production build has no drafts. To the author, so in both languages.
            <p role="note" data-testid="draft-banner" className="mb-6 max-w-[48rem] rounded-md border border-signal-2 bg-signal-2/10 px-4 py-3 font-sans text-sm leading-relaxed">
              <strong className="font-semibold text-signal-2">草稿 DRAFT</strong>
              <span className="mx-2 text-muted-foreground">/</span>
              這篇只在本機的 <code className="font-mono text-xs">next dev</code> 看得到，正式站不會出現。拿掉 frontmatter 的 <code className="font-mono text-xs">draft: true</code>（中英文兩個檔）才會發布。
              <span lang="en" className="mt-1 block text-muted-foreground">Only <code className="font-mono text-xs">next dev</code> shows this page; production builds leave it out. Remove <code className="font-mono text-xs">draft: true</code> from both language files to publish.</span>
            </p>
          )}
          <header className="max-w-[48rem] border-b border-rule pb-8">
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <EntryNo no={post.no} draft={post.draft} className="text-signal" />
              {post.interactive && <InteractiveBadge label={t.post.interactive} />}
            </p>
            {/* Same name as the title in the post index: the browser morphs one into the other. */}
            <ViewTransition name={`post-title-${slug}`} share="title-morph" default="none">
              <h1 className="mt-5 font-heading text-[clamp(2.125rem,5vw,3.25rem)] leading-[1.12] font-semibold tracking-tight text-balance">
                {post.title}
              </h1>
            </ViewTransition>
            <p className="mt-5 font-serif text-xl leading-relaxed text-muted-foreground">{post.description}</p>
            <dl className="mt-7 flex flex-wrap gap-x-8 gap-y-3 font-mono text-xs">
              <div>
                <dt className="text-muted-foreground">{t.post.published}</dt>
                <dd className="mt-0.5">
                  <time dateTime={post.date}>{formatDate(post.date, locale)}</time>
                </dd>
              </div>
              {post.updated && (
                <div>
                  <dt className="text-muted-foreground">{t.post.updated}</dt>
                  <dd className="mt-0.5">
                    <time dateTime={post.updated}>{formatDate(post.updated, locale)}</time>
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">{t.post.readingTime}</dt>
                <dd className="mt-0.5">{t.post.minutes(post.readingMinutes)}</dd>
              </div>
            </dl>
          </header>

          {post.isFallback && (
            <p
              role="note"
              data-testid="fallback-banner"
              className="mt-6 flex max-w-[42.5rem] flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-signal-2/50 bg-panel px-4 py-3 text-sm"
            >
              <Languages className="size-4 text-signal-2" aria-hidden />
              {t.post.fallback}
              <Link href={`/zh/posts/${slug}`} className="text-signal underline underline-offset-4">
                {t.post.fallbackSwitch}
              </Link>
            </p>
          )}

          {/* Sticks just under the site header (h-14) for the whole article. */}
          <div className="sticky top-14 z-30 mt-6 xl:hidden">
            <TocDisclosure items={toc} label={t.post.toc} />
          </div>

          {/* Body column; sidenotes and wide figures reach right into the margin column. */}
          <div className="mt-10 max-w-[42.5rem]">
            <div className="prose-notebook" lang={htmlLang[post.locale]}>
              <Content />
            </div>
            <PostFooter
              locale={locale}
              post={post}
              newer={newer}
              older={older}
              related={getRelatedPosts(slug, locale)}
              t={t.post}
            />
          </div>
        </div>
      </article>
    </>
  );
}
