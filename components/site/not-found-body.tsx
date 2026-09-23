"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Entry { slug: string; no: number; title: string }
type Strings = { title: string; body: string; home: string; browse: string; latest: string; search: string; posts: Entry[] };

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
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/${locale}`} className={cn(buttonVariants())}>{t.home}</Link>
            <Link href={`/${locale}/posts`} className={cn(buttonVariants({ variant: "outline" }))}>{t.browse}</Link>
            <span className="text-sm text-muted-foreground">{t.search}</span>
          </div>
        </>
      ) : (
        <>
          <h1 className="font-heading text-4xl font-semibold"><span lang="zh-Hant-TW">{zh.title}</span> / <span lang="en">{en.title}</span></h1>
          <p className="font-serif text-lg text-muted-foreground"><span lang="zh-Hant-TW">{zh.body}</span> <span lang="en">{en.body}</span></p>
          <div className="flex gap-3">
            <Link href="/zh" className={cn(buttonVariants())}>{zh.home}</Link>
            <Link href="/en" lang="en" className={cn(buttonVariants({ variant: "outline" }))}>{en.home}</Link>
          </div>
        </>
      )}

      {/*
        A dead link is exactly when a reader needs somewhere to go, and the page used to end here with a single
        button and 250 px of nothing under it. The five newest articles are the cheapest useful answer.
      */}
      <div className="mt-6 w-full max-w-2xl border-t border-rule pt-6">
        <p className="label mb-3">{t.latest}</p>
        <ul className="grid gap-1">
          {t.posts.map((post) => (
            <li key={post.slug}>
              <Link
                href={`/${locale ?? "zh"}/posts/${post.slug}`}
                className="group flex items-baseline gap-3 rounded-sm py-1.5 text-foreground"
              >
                <span className="font-mono text-xs text-signal">№ {String(post.no).padStart(3, "0")}</span>
                <span className="font-heading text-lg leading-snug decoration-signal decoration-1 underline-offset-4 group-hover:underline">{post.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
