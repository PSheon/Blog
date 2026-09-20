import { type Labels, personName } from "./labels";
import { type City, formatTime, type SimEvent } from "./sim";

/** Place ids only mean something in the city they came from: always pass the city of the same snapshot as the rows. */
export const placeName = (t: Labels, city: City, id: number): string => {
  if (id < 0) return t.ev.street;
  const place = city.places[id], block = city.blocks[place.block];
  return `${t.places[place.kind]}(${t.zones[block.zone]} ${block.label})`;
};

/** "Day 2 07:40 阿凱 離開 家(住宅區 B3) → 前往 辦公(商業區 D5)" — put together here; the record itself holds no text. */
export function describeEvent(t: Labels, city: City, e: SimEvent): string {
  const when = formatTime(e.t);
  if (e.type === "config") return `${when} ${t.ev.config}：${e.mode ? t.modes[e.mode] : ""}・${t.duty} ${e.duty ? t.ev.on : t.ev.off}`;
  const who = personName(t, e.agent), action = e.action ? t.actionNouns[e.action] : "";
  if (e.type === "departed") return `${when} ${who} ${t.ev.departed} ${placeName(t, city, e.from)} → ${t.ev.heading} ${placeName(t, city, e.place)}`;
  if (e.type === "idle") return `${when} ${who} ${t.ev.idle} ${placeName(t, city, e.place)}`;
  return `${when} ${who} ${e.type === "started" ? t.ev.started : t.ev.finished} ${action} · ${placeName(t, city, e.place)}`;
}
