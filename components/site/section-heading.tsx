import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A home-page section title with its place in the notebook in front: "§ 01", then a short length of the
 * site gradient. `label` sets the title itself in instrument lettering, for a section whose content is the headline.
 */
export function SectionHeading({ id, no, label = false, children }: { id: string; no: string; label?: boolean; children: ReactNode }) {
  return (
    <h2 id={id} className={cn("flex items-center gap-3", label ? "label mb-6" : "font-heading text-2xl font-semibold")}>
      <span className="label text-signal" aria-hidden>
        § {no}
      </span>
      <span className="triad-gradient h-px w-8 opacity-70" aria-hidden />
      {children}
    </h2>
  );
}
