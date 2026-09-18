import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function EntryNo({ no, className }: { no: number; className?: string }) {
  return <span className={cn("font-mono tabular", className)}>№ {String(no).padStart(3, "0")}</span>;
}

export function TagLink({ tag, locale, className }: { tag: string; locale: Locale; className?: string }) {
  return (
    <Link
      href={`/${locale}/tags/${tag}`}
      className={cn(
        "rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:border-signal hover:text-signal",
        className,
      )}
    >
      {tag}
    </Link>
  );
}

export function InteractiveBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-signal">
      <span className="size-1.5 rounded-full bg-signal motion-safe:animate-pulse" aria-hidden />
      {label}
    </span>
  );
}
