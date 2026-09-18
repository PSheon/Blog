import type { ReactNode } from "react";
import { type FigureSize, figureSize } from "@/components/mdx/figure";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "./error-boundary";

interface Props {
  /** Figure number, e.g. "03". */
  fig?: string;
  /** Short machine-ish name shown in the title bar, e.g. "conv2d". */
  title: string;
  size?: FigureSize;
  caption?: ReactNode;
  /** Right side of the title bar: status, readouts. */
  status?: ReactNode;
  /** Classes for the dot-grid stage. */
  className?: string;
  /** Classes for the outer <figure>, e.g. to drop the prose margins outside an article. */
  figureClassName?: string;
  children: ReactNode;
}

/**
 * The frame every interactive figure shares: a title bar lettered like bench
 * equipment, a dot-grid stage, and a caption. Server-rendered; the live part is
 * whatever client component you put inside.
 */
export function Instrument({ fig, title, size = "inline", caption, status, className, figureClassName, children }: Props) {
  return (
    <figure className={cn("not-prose my-10 clear-both", figureSize[size], figureClassName)} data-instrument={title}>
      <div className="overflow-hidden rounded-md border border-border bg-panel">
        <div className="flex items-center gap-3 border-b border-border px-3.5 py-2">
          <span className="size-1.5 rounded-full bg-signal" aria-hidden />
          <span className="label truncate text-foreground">
            {fig && <span className="text-signal">fig {fig}</span>}
            {fig && <span className="mx-2 text-muted-foreground">/</span>}
            {title}
          </span>
          {status && <span className="label ml-auto flex shrink-0 items-center gap-3">{status}</span>}
        </div>
        <div className={cn("dot-grid p-4 font-sans sm:p-5", className)}>
          <ErrorBoundary
            fallback={
              <p className="py-8 text-center text-sm text-muted-foreground">
                This instrument hit an error. The rest of the article is unaffected.
              </p>
            }
          >
            {children}
          </ErrorBoundary>
          <noscript>
            <p className="pt-3 text-center text-sm text-muted-foreground">
              This interactive figure needs JavaScript.
            </p>
          </noscript>
        </div>
      </div>
      {caption && (
        <figcaption className="mt-3 font-sans text-sm leading-relaxed text-muted-foreground">{caption}</figcaption>
      )}
    </figure>
  );
}
