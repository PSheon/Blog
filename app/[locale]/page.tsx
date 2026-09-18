import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Instrument } from "@/components/lab/instrument";
import { HeroInstrument } from "@/components/site/hero-instrument";
import { PostIndex } from "@/components/site/post-index";
import { EntryNo, InteractiveBadge } from "@/components/site/post-meta";
import { PostPreview } from "@/components/site/post-previews";
import { hasPreview } from "@/lib/content/previews";
import { buttonVariants } from "@/components/ui/button";
import { getAllPosts, getAllTags } from "@/lib/content/posts";
import { toRows } from "@/lib/content/rows";
import { formatDate, getDictionary, isLocale } from "@/lib/i18n";
import { site } from "@/lib/site";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const posts = getAllPosts(locale);
  const featured = posts.find((p) => p.featured) ?? posts[0];
  const latest = posts[0];

  return (
    <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
      {/* Hero: the thing itself first, the words beside it. */}
      <section className="grid gap-10 pt-12 pb-16 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-center lg:gap-16 lg:pt-20 lg:pb-24">
        <div>
          <h1 className="triad-text w-fit font-heading text-[clamp(2.75rem,7vw,5.25rem)] leading-[1.08] font-semibold tracking-tight">
            {t.hero.tagline.map((word) => (
              <span key={word} className="block">
                {word}
                {locale === "en" && "."}
              </span>
            ))}
          </h1>
          <p className="mt-8 max-w-[52ch] font-serif text-lg leading-relaxed text-muted-foreground">{t.hero.intro}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {latest && (
              <Link href={`/${locale}/posts/${latest.slug}`} className={buttonVariants({ size: "lg" })}>
                {t.hero.ctaPrimary}
                <ArrowRight data-icon="inline-end" />
              </Link>
            )}
            <Link href={`/${locale}/posts`} className={buttonVariants({ size: "lg", variant: "outline" })}>
              {t.hero.ctaSecondary}
            </Link>
          </div>
        </div>

        <div className="relative">
          <div className="hero-glow" aria-hidden />
        <Instrument
          title={t.hero.instrumentTitle}
          figureClassName="my-0"
          caption={
            <>
              {t.hero.instrumentCaption}{" "}
              <Link
                href={`/${locale}/posts/cnn-from-scratch`}
                className="text-signal underline decoration-signal/40 underline-offset-4 hover:decoration-signal"
              >
                {t.hero.instrumentMore}
              </Link>
            </>
          }
        >
          <HeroInstrument hint={t.hero.instrumentHint} />
        </Instrument>
        </div>
      </section>

      {featured && (
        <section aria-labelledby="featured" className="border-t border-rule py-12">
          <h2 id="featured" className="label mb-6">
            {t.home.featured}
          </h2>
          <Link
            href={`/${locale}/posts/${featured.slug}`}
            className="group grid gap-8 md:grid-cols-[minmax(0,1fr)_20rem] md:items-center lg:gap-16"
          >
            <div>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <EntryNo no={featured.no} className="text-signal" />
                <time dateTime={featured.date} className="label">
                  {formatDate(featured.date, locale)}
                </time>
                <span className="label">{t.post.minutes(featured.readingMinutes)}</span>
                {featured.interactive && <InteractiveBadge label={t.post.interactive} />}
              </p>
              <h3 className="mt-4 font-heading text-3xl leading-tight font-semibold text-balance decoration-signal decoration-1 underline-offset-[6px] group-hover:underline sm:text-4xl">
                {featured.title}
              </h3>
              <p className="mt-4 max-w-[58ch] font-serif text-lg leading-relaxed text-muted-foreground">
                {featured.description}
              </p>
            </div>
            {hasPreview(featured.slug) && (
              <div className="glass-3 rounded-lg p-2.5">
                <PostPreview slug={featured.slug} />
              </div>
            )}
          </Link>
        </section>
      )}

      <section aria-labelledby="index" className="border-t border-rule py-12">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="index" className="font-heading text-2xl font-semibold">
              {t.home.index}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t.home.indexLead}</p>
          </div>
          <Link href={`/${locale}/posts`} className="text-sm text-signal underline-offset-4 hover:underline">
            {t.home.viewAll}
          </Link>
        </div>
        <PostIndex
          locale={locale}
          rows={toRows(posts, locale)}
          tags={getAllTags(locale).map((x) => x.tag)}
          labels={{ all: t.home.all, empty: t.home.empty, interactive: t.post.interactive, filter: t.nav.tags }}
        />
      </section>

      <section aria-labelledby="about" className="border-t border-rule py-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div>
            <h2 id="about" className="font-heading text-2xl font-semibold">
              {t.about.strip}
            </h2>
            <p className="mt-4 font-serif text-lg leading-relaxed text-muted-foreground">{t.about.bio}</p>
            <p className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <a href={site.github} target="_blank" rel="me noreferrer" className="text-signal underline-offset-4 hover:underline">
                GitHub
              </a>
            </p>
          </div>
          <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {t.about.focus.map((f) => (
              <div key={f.key} className="border-t border-rule pt-3">
                <dt className="font-medium">{f.title}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}
