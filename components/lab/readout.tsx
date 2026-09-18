import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = { signal: "text-signal", amber: "text-signal-2", muted: "text-muted-foreground", plain: "text-foreground" };

interface Props {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: keyof typeof tones;
  /** The headline number of an instrument. */
  large?: boolean;
  className?: string;
}

/** A labelled number, set in tabular mono so it doesn't jitter as it changes. */
export function Readout({ label, value, unit, tone = "signal", large, className }: Props) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="label">{label}</div>
      <div className={cn("font-mono leading-tight tabular", large ? "text-4xl" : "text-lg", tones[tone])}>
        {value}
        {unit && <span className="ml-1 text-xs text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}
