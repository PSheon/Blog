import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type FigureSize = "inline" | "wide" | "full";

/** Width classes shared by figures and instruments. `wide` reaches into the sidenote margin. */
export const figureSize: Record<FigureSize, string> = {
  inline: "",
  wide: "xl:w-[calc(100%+var(--margin-w)+var(--margin-gap))]",
  full: "-mx-5 w-[calc(100%+2.5rem)] sm:mx-0 sm:w-full xl:w-[calc(100%+var(--margin-w)+var(--margin-gap))]",
};

interface Props {
  fig?: string;
  caption?: ReactNode;
  size?: FigureSize;
  children: ReactNode;
}

export function Figure({ fig, caption, size = "inline", children }: Props) {
  return (
    <figure className={cn("not-prose my-10 clear-both", figureSize[size])}>
      <div className="overflow-hidden rounded-md border border-border bg-panel">{children}</div>
      {(fig || caption) && (
        <figcaption className="mt-3 flex gap-3 font-sans text-sm leading-relaxed text-muted-foreground">
          {fig && <span className="label shrink-0 pt-0.5 text-signal">fig {fig}</span>}
          <span>{caption}</span>
        </figcaption>
      )}
    </figure>
  );
}
