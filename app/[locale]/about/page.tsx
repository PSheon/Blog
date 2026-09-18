import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/site/page-header";
import { getDictionary, isLocale } from "@/lib/i18n";
import { site } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/about">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return { title: t.about.title, description: t.about.bio, alternates: { canonical: `/${locale}/about` } };
}

export default async function AboutPage({ params }: PageProps<"/[locale]/about">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { about } = getDictionary(locale);
  return (
    <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
      <PageHeader title={about.title} />
      <div className="grid gap-12 border-t border-rule pt-10 lg:grid-cols-[minmax(0,42.5rem)_1fr] lg:gap-20">
        <div className="prose-notebook">
          <p>{about.bio}</p>
          <h2>{about.whyTitle}</h2>
          <p>{about.why}</p>
          <h2>{about.colophonTitle}</h2>
          <p>{about.colophon}</p>
          <p>
            <a href={site.github} target="_blank" rel="me noreferrer">GitHub</a>
            {" / "}
            <a href={site.company.url} target="_blank" rel="noreferrer">{site.company.name}</a>
            {" / "}
            <a href={site.repo} target="_blank" rel="noreferrer">{locale === "zh" ? "本站原始碼" : "Source for this site"}</a>
          </p>
        </div>
        <dl className="grid content-start gap-6">
          {about.focus.map((f) => (
            <div key={f.key} className="border-t border-rule pt-3">
              <dt className="font-medium">{f.title}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
