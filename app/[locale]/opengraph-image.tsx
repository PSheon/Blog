import { getDictionary, isLocale, locales } from "@/lib/i18n";
import { ogSize, renderCard } from "@/lib/og/render";

export const size = ogSize;
export const contentType = "image/png";
export const alt = "paul.notebook";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = getDictionary(isLocale(locale) ? locale : "zh");
  const [title, tagline] = t.meta.title.split(" — ");
  return renderCard({ title: tagline ?? title, description: t.meta.description, fallbackTitle: "machine learning models, built from scratch" });
}
