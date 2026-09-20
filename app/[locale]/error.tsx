"use client"; // Error boundaries must be Client Components

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { buttonVariants } from "@/components/ui/button";

// Kept here rather than in the dictionaries: those hold functions, and this file is client code that must
// still render when whatever broke is the content pipeline itself.
const copy = {
  zh: { title: "這一頁出了點問題", body: "不是你的操作造成的。可以再試一次，或回到首頁。", retry: "再試一次", home: "回到首頁" },
  en: { title: "Something went wrong on this page", body: "It is not something you did. Try again, or go back home.", retry: "Try again", home: "Back home" },
};

/** Renders inside the locale layout, so the header, the footer and the theme are all still there. */
export default function LocaleError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { locale } = useParams<{ locale: string }>();
  const lang = locale === "en" ? "en" : "zh";
  const t = copy[lang];

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto grid w-full max-w-7xl place-items-start gap-5 px-5 py-24 sm:px-8">
      <p className="font-mono text-sm text-signal-2">error{error.digest ? ` · ${error.digest}` : ""}</p>
      <h1 className="font-heading text-4xl font-semibold">{t.title}</h1>
      <p className="font-serif text-lg text-muted-foreground">{t.body}</p>
      <div className="flex gap-3">
        <button type="button" onClick={() => retry()} className={buttonVariants()}>
          {t.retry}
        </button>
        <Link href={`/${lang}`} className={buttonVariants({ variant: "outline" })}>
          {t.home}
        </Link>
      </div>
    </div>
  );
}
