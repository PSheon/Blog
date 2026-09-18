import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/site/page-header";
import { getAllTags } from "@/lib/content/posts";
import { getDictionary, isLocale } from "@/lib/i18n";
import { sharedMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/tags">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return { title: t.tags.title, description: t.tags.description, ...sharedMetadata(locale, "/tags") };
}

export default async function TagsPage({ params }: PageProps<"/[locale]/tags">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  return (
    <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
      <PageHeader title={t.tags.title} lead={t.tags.lead} />
      <ul className="grid border-t border-rule sm:grid-cols-2 sm:gap-x-12 lg:grid-cols-3">
        {getAllTags(locale).map(({ tag, count }) => (
          <li key={tag} className="border-b border-rule">
            <Link href={`/${locale}/tags/${tag}`} className="group flex items-baseline justify-between py-4">
              <span className="font-mono text-base group-hover:text-signal">#{tag}</span>
              <span className="label">{t.tags.count(count)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
