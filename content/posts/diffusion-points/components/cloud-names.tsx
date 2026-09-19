import { cn } from "@/lib/utils";

/** Names under the clouds of a stage. With three, a phone shows the first and last on top and the middle one below. */
export function CloudNames({ names }: { names: string[] }) {
  const three = names.length === 3;
  return (
    <div className={cn("label pointer-events-none absolute inset-0 grid p-2 text-center text-white/80", three ? "grid-cols-2 grid-rows-2 sm:grid-cols-3 sm:grid-rows-1" : "grid-cols-2")} aria-hidden>
      {names.map((name, i) => (
        <span key={i} className={cn("self-end", three && i === 1 && "order-last col-span-2 sm:order-none sm:col-span-1", three && i !== 1 && "self-start sm:self-end")}>
          {name}
        </span>
      ))}
    </div>
  );
}
