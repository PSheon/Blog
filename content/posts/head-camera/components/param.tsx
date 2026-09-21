import { Slider } from "@/components/ui/slider";

interface Props {
  label: string;
  shown?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange(value: number): void;
}

/** A labelled slider with its current value set in mono. */
export function Param({ label, shown, value, min, max, step, onChange }: Props) {
  return (
    <label className="grid gap-2">
      <span className="flex items-baseline justify-between gap-3">
        <span className="label">{label}</span>
        <span className="font-mono text-sm tabular">{shown ?? value}</span>
      </span>
      <Slider value={[value]} min={min} max={max} step={step} aria-label={label} onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)} />
    </label>
  );
}
