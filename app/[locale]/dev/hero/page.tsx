import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/i18n";
import { HeroBench } from "./bench";

export const metadata = { title: "hero / stations", robots: { index: false, follow: false } };

/**
 * A bench, `next dev` only: the hero's four stations at a chosen phone or laptop width, each measuring itself, so
 * a layout question can be settled by looking rather than by reading a table of numbers. It never ships.
 */
export default function DevHero() {
  if (process.env.NODE_ENV === "production") notFound();
  const t = getDictionary("zh");
  return <HeroBench t={{ think: t.hero.think, generate: t.hero.generate, act: t.hero.act, hint: t.hero.instrumentHint }} />;
}
