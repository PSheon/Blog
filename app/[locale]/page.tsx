import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HeroStations } from "@/components/site/hero-stations";
import { PostBento } from "@/components/site/post-bento";
import { CornerMarks } from "@/components/lab/corner-marks";
import { PostCover } from "@/components/site/post-cover";
import { EntryNo, InteractiveBadge } from "@/components/site/post-meta";
import { PostPreview } from "@/components/site/post-previews";
import { NumberTicker } from "@/components/site/number-ticker";
import { SectionHeading } from "@/components/site/section-heading";
import { TriadRail } from "@/components/site/triad-rail";
import { countOperators } from "@/lib/content/ml-stats";
import { hasPreview } from "@/lib/content/previews";
import { buttonVariants } from "@/components/ui/button";
import { getAllPosts, getAllTags } from "@/lib/content/posts";
import { toRows } from "@/lib/content/rows";
import { formatDate, getDictionary, htmlLang, isLocale } from "@/lib/i18n";
import { site } from "@/lib/site";

/** The site gradient, cyan → violet → pink, sampled at the four stops of the rail. */
const RAIL_COLORS = ["var(--signal)", "var(--signal-3)", "color-mix(in oklab, var(--signal-3), var(--signal-2))", "var(--signal-2)"];

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const posts = getAllPosts(locale);
  // The card under the hero is the newest article. It used to be whichever post carried `featured: true`, which
  // stayed on № 001 — the same CNN the hero already shows — while six newer articles came out.
  const latest = posts[0];
  const readouts = [
    { label: t.home.readouts.posts, value: posts.length, pad: 2 },
    { label: t.home.readouts.interactive, value: posts.filter((p) => p.interactive).length, pad: 2 },
    { label: t.home.readouts.operators, value: countOperators(), pad: 0 },
  ];

  // What the site is and who writes it, for search engines: the home page had no structured data at all.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: site.name,
    description: t.meta.description,
    url: `${site.url}/${locale}`,
    inLanguage: htmlLang[locale],
    author: { "@type": "Person", name: site.author, url: site.github },
    blogPost: posts.slice(0, 10).map((p) => ({ "@type": "BlogPosting", headline: p.title, url: `${site.url}/${p.locale}/posts/${p.slug}`, datePublished: p.date })),
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {/* Hero: the thing itself first, the words beside it. */}
      {/* On a phone the instrument goes straight under the headline, ahead of the intro: it is the point of the site,
          and it used to start on the second screen. The left column dissolves (`contents`) so its children can be ordered. */}
      <section className="relative grid gap-7 pt-10 pb-10 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-center lg:gap-16 lg:pt-20 lg:pb-14">
        <div className="hero-grid" aria-hidden />
        <div className="max-lg:contents">
          {/* A title that says what is here, and a subtitle that says how: Paul asked for a technical blog's title,
              not a slogan. The see / think / generate / act words live on in the rail below. */}
          <h1 style={{ "--i": 0 } as React.CSSProperties} className="reveal triad-text order-1 w-fit font-heading text-[clamp(2.25rem,4.6vw,3.75rem)] leading-[1.12] font-semibold tracking-tight text-balance">
            {t.hero.title}
          </h1>
          <p style={{ "--i": 1 } as React.CSSProperties} className="reveal order-1 font-heading text-xl leading-snug font-medium text-foreground/90 max-lg:-mt-3 sm:text-2xl lg:mt-5">{t.hero.subtitle}</p>
          <p className="order-3 max-w-[52ch] font-serif text-lg leading-relaxed text-muted-foreground lg:mt-8">{t.hero.intro}</p>
          <div className="order-4 flex flex-wrap gap-3 lg:mt-8">
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
          {/* Three numbers lettered like an instrument's readouts; counted from the posts, not typed in. */}
          <dl className="order-5 flex gap-6 sm:gap-8 border-t border-rule pt-5 lg:mt-10 lg:max-w-md">
            {readouts.map((r, i) => (
              <div key={r.label} className="flex flex-col-reverse justify-end gap-1">
                <dt className="label">{r.label}</dt>
                <dd className="font-mono text-2xl leading-none tabular" style={{ color: RAIL_COLORS[i === 2 ? 3 : i] }}>
                  <NumberTicker value={r.value} pad={r.pad} />
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div style={{ "--i": 2 } as React.CSSProperties} className="reveal relative order-2">
          <div className="hero-glow" aria-hidden />
        <HeroStations
          label={t.hero.stationsLabel}
          hint={t.hero.instrumentHint}
          t={{ think: t.hero.think, generate: t.hero.generate, act: t.hero.act }}
          stations={[
            { key: "see", word: t.hero.topics[0].word, color: RAIL_COLORS[0], title: t.hero.instrumentTitle, caption: t.hero.instrumentCaption, more: t.hero.instrumentMore, href: `/${locale}/posts/cnn-from-scratch` },
            { key: "think", word: t.hero.topics[1].word, color: RAIL_COLORS[1], ...t.hero.stations.think, href: `/${locale}/posts/transformer-from-scratch` },
            { key: "generate", word: t.hero.topics[2].word, color: RAIL_COLORS[2], ...t.hero.stations.generate, href: `/${locale}/posts/diffusion-points` },
            { key: "act", word: t.hero.topics[3].word, color: RAIL_COLORS[3], ...t.hero.stations.act, href: `/${locale}/posts/ai-flappy-bird` },
          ]}
        />
        </div>
      </section>

      <TriadRail
        locale={locale}
        label={t.home.topics}
        stops={t.hero.topics.map((s, i) => ({ ...s, color: RAIL_COLORS[i], count: posts.filter((p) => p.tags.includes(s.tag)).length }))}
      />

      {latest && (
        <section aria-labelledby="latest" className="border-t border-rule py-12">
          <SectionHeading id="latest" no="01" label>
            {t.home.latest}
          </SectionHeading>
          <Link href={`/${locale}/posts/${latest.slug}`} className="group relative block">
            <div className="card-glow" aria-hidden />
            <CornerMarks />
            <div className="spotlight grid overflow-hidden rounded-md border border-border bg-panel transition-colors group-hover:border-foreground/25 md:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:grid-cols-[minmax(0,1fr)_30rem]">
              <div className="p-6 sm:p-8 lg:p-10">
                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <EntryNo no={latest.no} className="text-signal" />
                  <time dateTime={latest.date} className="label">
                    {formatDate(latest.date, locale)}
                  </time>
                  <span className="label">{t.post.minutes(latest.readingMinutes)}</span>
                  {latest.interactive && <InteractiveBadge label={t.post.interactive} />}
                </p>
                <h3 className="mt-4 font-heading text-3xl leading-tight font-semibold text-balance decoration-signal decoration-1 underline-offset-[6px] group-hover:underline sm:text-4xl">
                  {latest.title}
                </h3>
                <p className="mt-4 max-w-[58ch] font-serif text-lg leading-relaxed text-muted-foreground">{latest.description}</p>
                <p className="mt-7 inline-flex items-center gap-2 text-sm font-medium text-signal">
                  {t.post.readMore}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                </p>
              </div>
              {/* The stage is dark in both themes, like the article's own: yellow points vanish on white. */}
              <div className="dark relative flex items-center border-t border-border bg-[#070918] md:border-t-0 md:border-l">
                <div className="dot-grid absolute inset-0 opacity-60" aria-hidden />
                <div className="relative w-full p-4">
                  {hasPreview(latest.slug) ? <PostPreview slug={latest.slug} /> : <PostCover slug={latest.slug} no={latest.no} />}
                </div>
              </div>
            </div>
          </Link>
        </section>
      )}

      <section aria-labelledby="index" className="border-t border-rule py-12">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <SectionHeading id="index" no="02">
              {t.home.index}
            </SectionHeading>
            <p className="mt-1 text-sm text-muted-foreground">{t.home.indexLead}</p>
          </div>
          <Link href={`/${locale}/posts`} className="inline-flex min-h-6 items-center text-sm text-signal underline-offset-4 hover:underline">
            {t.home.viewAll}
          </Link>
        </div>
        <PostBento
          locale={locale}
          // The newest article has its own card right above; the index starts with the one before it.
          rows={toRows(posts.filter((p) => p.slug !== latest?.slug), locale)}
          tags={getAllTags(locale).map((x) => x.tag)}
          labels={{ all: t.home.all, empty: t.home.empty, interactive: t.post.interactive, filter: t.nav.tags }}
        />
      </section>

      <section aria-labelledby="about" className="border-t border-rule py-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div>
            <SectionHeading id="about" no="03">
              {t.about.strip}
            </SectionHeading>
            <p className="mt-4 font-serif text-lg leading-relaxed text-muted-foreground">{t.about.bio}</p>
            <p className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <a href={site.github} target="_blank" rel="me noreferrer" className="inline-flex min-h-6 items-center text-signal underline-offset-4 hover:underline">
                GitHub
              </a>
            </p>
          </div>
          <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {t.about.focus.map((f, i) => (
              <div key={f.key} className="relative border-t border-rule pt-3">
                {/* A short length of the rail's gradient on each rule: the four fields sit along the same see → act path. */}
                <span className="absolute -top-px left-0 h-px w-10" style={{ background: RAIL_COLORS[i % RAIL_COLORS.length] }} aria-hidden />
                <dt className="flex items-baseline justify-between gap-3 font-medium">
                  {f.title}
                  <span className="label" aria-hidden>
                    {f.key}
                  </span>
                </dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}
