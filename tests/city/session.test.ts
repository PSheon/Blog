import { describe, expect, it } from "vitest";
import { describeEvent, placeName } from "@/content/posts/city-of-agents/components/describe";
import { LABELS } from "@/content/posts/city-of-agents/components/labels";
import { CitySession } from "@/content/posts/city-of-agents/components/session";

describe("the Overseer's snapshot", () => {
  it("carries its own city, so rows from before a rebuild are never read against the city after it", () => {
    const s = new CitySession({ seed: 1, n: 8, agents: 120 });
    for (let k = 0; k < 900; k++) s.world.tick();
    const old = s.panel(50), oldCity = s.city;
    s.rebuild({ seed: 2, n: 4, agents: 120 }); // a much smaller city: most of the old place ids do not exist in it
    const fresh = s.panel(50);

    expect(old.city).toBe(oldCity);
    expect(fresh.city).toBe(s.city);
    expect(fresh.city).not.toBe(oldCity);
    // This is the crash that was reported: the old rows name places the new city does not have.
    const orphaned = old.people.filter((p) => p.place >= s.city.places.length).length;
    expect(orphaned).toBeGreaterThan(0);
    // Read against their own city, every row and every event still makes a sentence.
    for (const p of old.people) expect(placeName(LABELS.zh, old.city, p.place)).toMatch(/\S/);
    expect(old.events.length).toBeGreaterThan(10);
    for (const e of old.events) expect(describeEvent(LABELS.zh, old.city, e)).toContain("Day");
    for (const p of fresh.people) expect(placeName(LABELS.en, fresh.city, p.place)).toMatch(/\S/);
  });

  it("never follows someone who is not there", () => {
    const s = new CitySession({ seed: 1, n: 8, agents: 200 });
    s.rebuild({ seed: 1, n: 8, agents: 20 });
    const panel = s.panel();
    expect(panel.follow).toBeLessThan(panel.people.length);
    expect(panel.people).toHaveLength(20);
  });
});
