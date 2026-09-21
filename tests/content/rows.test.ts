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

describe("a draft is not reachable by its URL", () => {
  it("getPostMeta() answers null for a draft unless drafts are asked for", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs"), { tmpdir } = await import("node:os"), { join } = await import("node:path");
    const { getPostMeta } = await import("@/lib/content/posts");
    const dir = mkdtempSync(join(tmpdir(), "posts-"));
    mkdirSync(join(dir, "wip"));
    writeFileSync(join(dir, "wip", "zh.mdx"), "---\ntitle: 還沒寫完\ndescription: 這是一篇還沒寫完的草稿，用來測試草稿不會被網址直接打開。\ndate: 2026-09-21\ntags: [from-scratch]\nno: 99\ndraft: true\n---\n\n內文。\n");
    expect(getPostMeta("wip", "zh", { dir, includeDrafts: false })).toBeNull();
    expect(getPostMeta("wip", "zh", { dir, includeDrafts: true })?.no).toBe(99);
  });
});
