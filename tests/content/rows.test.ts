import { describe, expect, it } from "vitest";
import { getAllPosts } from "@/lib/content/posts";
import { toRows } from "@/lib/content/rows";

describe("index rows", () => {
  it("carry the draft flag, so a draft can be marked wherever it is listed", () => {
    const [post] = getAllPosts("zh");
    const [published] = toRows([post], "zh"), [draft] = toRows([{ ...post, draft: true }], "zh");
    expect(published.draft).toBe(false);
    expect(draft.draft).toBe(true);
  });

  it("a listing without drafts has none: that is what a production build gets", () => {
    expect(getAllPosts("zh", { includeDrafts: false }).some((p) => p.draft)).toBe(false);
  });
});
