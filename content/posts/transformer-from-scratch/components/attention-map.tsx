import { HeatCanvas } from "@/components/lab/heat-canvas";
import { LENGTH, SEP } from "./task";

interface Props {
  map: Float64Array | null;
  tokens: number[];
  title: string;
  label: string;
}

const glyph = (t: number) => (t === SEP ? "→" : String(t));

/** A T×T attention matrix with its tokens written along both axes. */
export function AttentionMap({ map, tokens, title, label }: Props) {
  const T = tokens.length;
  return (
    <div>
      <p className="label mb-1.5 text-foreground">{title}</p>
      <div className="grid grid-cols-[1.1rem_1fr] gap-1">
        <span />
        <div className="grid font-mono text-[0.65rem] text-muted-foreground" style={{ gridTemplateColumns: `repeat(${T}, 1fr)` }}>
          {tokens.map((t, i) => (
            <span key={i} className="text-center">{glyph(t)}</span>
          ))}
        </div>
        <div className="grid font-mono text-[0.65rem] text-muted-foreground" style={{ gridTemplateRows: `repeat(${T}, 1fr)` }}>
          {tokens.map((t, i) => (
            <span key={i} className={`grid place-items-center ${i >= LENGTH ? "text-signal" : ""}`}>{glyph(t)}</span>
          ))}
        </div>
        <div className="relative">
          <HeatCanvas data={map} w={map ? T : 1} h={map ? T : 1} max={1} label={label} />
          {/* The input half is never scored; veil it so the eye goes to the answer rows. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 bg-background/60" style={{ height: `${(LENGTH / T) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
