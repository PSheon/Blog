import Link from "next/link";
import type { Dictionary, Locale } from "@/lib/i18n";
import { site } from "@/lib/site";
import { KernelField } from "./kernel-field";
import { KernelMark } from "./kernel-mark";
import { LocaleSwitch } from "./locale-switch";
import { ThemeToggle } from "./theme-toggle";

const linkClass = "py-1 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline";

/**
 * The notebook's colophon: one sentence about how it is made, the handful of places to go, and the two
 * preferences. The dashed gradient along the top is the see → think → generate → act path coming to its end.
 */
export function SiteFooter({ locale, t }: { locale: Locale; t: Dictionary }) {
  const year = new Date().getFullYear();
  return (
    <footer className="relative mt-24">
      <div className="triad-gradient h-px opacity-60 [mask-image:repeating-linear-gradient(90deg,#000_0_4px,transparent_4px_10px)]" aria-hidden />
      {/* The mark, continued: a band of flickering cells that fades into the page before the text starts. */}
      <KernelField className="pointer-events-none absolute inset-x-0 top-px h-32 w-full text-signal opacity-70 [mask-image:linear-gradient(to_bottom,#000,transparent)]" />
      <div className="relative mx-auto w-full max-w-7xl px-5 pt-24 pb-6 sm:px-8">
        <div className="grid gap-x-12 gap-y-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div className="grid gap-5">
            <Link href={`/${locale}`} className="flex min-h-6 w-fit items-center gap-2.5">
              <KernelMark className="size-4" />
              <span className="font-mono text-sm">{site.name}</span>
            </Link>
            <p className="max-w-2xl font-serif text-xl leading-snug text-balance sm:text-2xl">{t.footer.colophon}</p>
          </div>
          <nav aria-label={t.footer.browse} className="flex flex-wrap gap-x-7 gap-y-1 md:justify-end md:pt-0.5">
            <Link href={`/${locale}/posts`} className={linkClass}>{t.nav.posts}</Link>
            <Link href={`/${locale}/tags`} className={linkClass}>{t.nav.tags}</Link>
            <a href={`/${locale}/feed.xml`} className={linkClass}>{t.footer.rss}</a>
            <a href={site.github} rel="me noreferrer" target="_blank" className={linkClass}>GitHub</a>
            <a href={site.repo} rel="noreferrer" target="_blank" className={linkClass}>{t.footer.source}</a>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-rule pt-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <span>© {year} {site.author}</span>
            <span>{t.footer.builtWith}</span>
          </p>
          <div role="group" aria-label={t.footer.preferences} className="flex items-center gap-2">
            <LocaleSwitch locale={locale} label={t.locale.switch} />
            <ThemeToggle t={t.theme} />
          </div>
        </div>
      </div>
    </footer>
  );
}
