"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { type Labels, personName } from "./labels";
import type { PanelState, PersonRow } from "./session";
import { type City, formatTime, type SimEvent } from "./sim";
import { SWATCH } from "./use-city";

const ROW = 30, VIEWPORT = 8;

const placeName = (t: Labels, city: City, id: number): string => {
  if (id < 0) return t.ev.street;
  const place = city.places[id], block = city.blocks[place.block];
  return `${t.places[place.kind]}(${t.zones[block.zone]} ${block.label})`;
};

/** "Day 2 07:40 阿凱 離開 家(住宅區 B3) → 前往 辦公(商業區 D5)" — put together here; the record itself holds no text. */
export function describeEvent(t: Labels, city: City, e: SimEvent): string {
  const when = formatTime(e.t);
  if (e.type === "config") return `${when} ${t.ev.config}：${e.mode ? t.modes[e.mode] : ""}・${t.duty} ${e.duty ? t.ev.on : t.ev.off}`;
  const who = personName(t, e.agent), action = e.action ? t.actions[e.action] : "";
  if (e.type === "departed") return `${when} ${who} ${t.ev.departed} ${placeName(t, city, e.from)} → ${t.ev.heading} ${placeName(t, city, e.place)}`;
  if (e.type === "idle") return `${when} ${who} ${t.ev.idle} ${placeName(t, city, e.place)}`;
  return `${when} ${who} ${e.type === "started" ? t.ev.started : t.ev.finished} ${action} · ${placeName(t, city, e.place)}`;
}

function Dot({ action }: { action: PersonRow["action"] }) {
  return <span className="dark contents"><span aria-hidden className={`size-2 shrink-0 rounded-full border border-border ${SWATCH[action ?? "idle"]}`} /></span>;
}

/** Every person, one row each, but only the rows in view exist: 300 rows of live bars would cost more than the 3-D scene. */
export function StatusTable({ t, city, people, follow, onFollow }: { t: Labels; city: City; people: PersonRow[]; follow: number; onFollow(id: number): void }) {
  const [top, setTop] = useState(0), scroller = useRef<HTMLDivElement>(null);
  const first = Math.max(0, Math.min(people.length - VIEWPORT, Math.floor(top / ROW) - 1)), rows = people.slice(first, first + VIEWPORT + 3);
  return (
    <div>
      <div className="label grid grid-cols-[4.5rem_1fr_5.5rem] gap-2 border-b border-border pb-1"><span>{t.person}</span><span>{t.doing}・{t.where}</span><span>{t.needs.split("・")[0]}…</span></div>
      <div ref={scroller} tabIndex={0} role="group" aria-label={t.table} className="relative overflow-y-auto" style={{ height: ROW * VIEWPORT }} onScroll={(e) => setTop(e.currentTarget.scrollTop)} data-testid="city-table">
        <div style={{ height: people.length * ROW }}>
          {rows.map((p, k) => (
            <button key={p.id} type="button" aria-pressed={p.id === follow} onClick={() => onFollow(p.id === follow ? -1 : p.id)}
              className={`absolute inset-x-0 grid grid-cols-[4.5rem_1fr_5.5rem] items-center gap-2 px-1 text-left hover:bg-muted/60 ${p.id === follow ? "bg-muted" : ""}`} style={{ top: (first + k) * ROW, height: ROW }}>
              <span className="truncate font-sans text-xs">{personName(t, p.id)}</span>
              <span className="flex min-w-0 items-center gap-1.5 text-xs">
                <Dot action={p.action} />
                <span className="truncate text-muted-foreground">{p.state === "idle" ? t.states.idle : `${p.state === "traveling" ? `${t.states.traveling} ` : ""}${p.action ? t.actions[p.action] : ""} · ${placeName(t, city, p.place)}`}</span>
              </span>
              <span className="grid grid-cols-4 gap-0.5" aria-label={p.needs.map((v, i) => `${t.needNames[i]} ${Math.round(v * 100)}%`).join(", ")} role="img">
                {p.needs.map((v, i) => <span key={i} className="flex h-3.5 items-end rounded-[1px] bg-muted"><span className={`w-full rounded-[1px] ${v > 0.75 ? "bg-signal-2" : "bg-signal"}`} style={{ height: `${Math.round(v * 100)}%` }} /></span>)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function EventStream({ t, city, events }: { t: Labels; city: City; events: SimEvent[] }) {
  return (
    <div>
      <p className="label border-b border-border pb-1">{t.events}</p>
      <ol aria-label={t.events} className="mt-1 grid h-40 content-start gap-0.5 overflow-hidden font-mono text-[11px] leading-snug text-muted-foreground" data-testid="city-events">
        {events.length ? events.map((e, k) => <li key={`${e.t}-${e.agent}-${e.type}-${k}`} className={k === 0 ? "text-foreground" : ""}>{describeEvent(t, city, e)}</li>) : <li>{t.noEvents}</li>}
      </ol>
    </div>
  );
}

/** Departures per ten minutes over the last 24 hours. One spike is a timetable; a spread is people deciding for themselves. */
export function DepartureChart({ t, histogram, people }: { t: Labels; histogram: number[]; people: number }) {
  const max = Math.max(1, ...histogram);
  return (
    <svg viewBox={`0 0 ${histogram.length} 24`} preserveAspectRatio="none" className="h-10 w-full text-signal" role="img" aria-label={`${t.histogram}; ${t.peak} ${Math.round((100 * max) / Math.max(1, people))}%`}>
      {histogram.map((v, i) => v > 0 && <rect key={i} x={i + 0.1} width={0.8} y={24 - (v / max) * 24} height={(v / max) * 24} fill="currentColor" />)}
    </svg>
  );
}

/** Drag back through the record. Marks show where the rules were changed. */
export function Timeline({ t, panel, onSeek, onLive }: { t: Labels; panel: PanelState; onSeek(time: number): void; onLive(): void }) {
  const span = Math.max(1, panel.now - panel.from);
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="label">{t.timeline}{panel.replaying && <span className="ml-2 text-signal-2">● {t.replay}</span>}</span>
        <span className="font-mono text-xs tabular">{formatTime(panel.t)}</span>
      </div>
      {/* The range input inside the slider takes its name from the label around it, as in Param. */}
      <label className="relative block">
        <span className="sr-only">{t.timeline}: {t.timelineHint}</span>
        <Slider value={[panel.t]} min={panel.from} max={Math.max(panel.from + 1, panel.now)} step={1} aria-label={`${t.timeline}: ${t.timelineHint}`} onValueChange={(v) => onSeek(Array.isArray(v) ? v[0] : v)} data-testid="city-timeline" />
        {panel.marks.map((m, k) => <span key={k} title={t.modeMark} aria-hidden className="pointer-events-none absolute -top-1 h-1.5 w-px bg-signal-2" style={{ left: `${((m - panel.from) / span) * 100}%` }} />)}
      </label>
      <div className="flex items-center justify-between gap-3">
        <span className="label">{t.recordFrom} {formatTime(panel.from)}</span>
        <Button size="sm" variant="ghost" disabled={!panel.replaying} onClick={onLive} data-testid="city-live">{t.live}</Button>
      </div>
    </div>
  );
}
