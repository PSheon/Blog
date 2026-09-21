"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";

type Strings = { title: string; body: string; home: string };

/**
 * The 404, in the reader's language when the URL says which one that is. `not-found.tsx` is given no route params,
 * which is why this page used to speak both languages at once; but the path starts with /zh or /en, and a client
 * component can read it. Only a URL outside both locales (/nope) gets both: nothing in it says who is asking.
 */
export function NotFoundBody({ zh, en }: { zh: Strings; en: Strings }) {
  const path = usePathname() ?? "", locale = path === "/en" || path.startsWith("/en/") ? "en" : path === "/zh" || path.startsWith("/zh/") ? "zh" : null;
  const t = locale === "en" ? en : zh;
  return (
    <div className="mx-auto grid w-full max-w-7xl place-items-start gap-5 px-5 py-24 sm:px-8" data-testid="not-found" data-locale={locale ?? "both"}>
      <p className="font-mono text-sm text-signal">404</p>
      {locale ? (
        <>
          <h1 className="font-heading text-4xl font-semibold">{t.title}</h1>
          <p className="font-serif text-lg text-muted-foreground">{t.body}</p>
          <Link href={`/${locale}`} className={buttonVariants()}>{t.home}</Link>
        </>
      ) : (
        <>
          <h1 className="font-heading text-4xl font-semibold"><span lang="zh-Hant-TW">{zh.title}</span> / <span lang="en">{en.title}</span></h1>
          <p className="font-serif text-lg text-muted-foreground"><span lang="zh-Hant-TW">{zh.body}</span> <span lang="en">{en.body}</span></p>
          <div className="flex gap-3">
            <Link href="/zh" className={buttonVariants()}>{zh.home}</Link>
            <Link href="/en" lang="en" className={buttonVariants({ variant: "outline" })}>{en.home}</Link>
          </div>
        </>
      )}
    </div>
  );
}
