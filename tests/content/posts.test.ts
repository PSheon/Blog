import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getAdjacentPosts,
  getAllPosts,
  getAllTags,
  getPostMeta,
  getRelatedPosts,
  getToc,
} from "@/lib/content/posts";

const dir = path.join(__dirname, "../fixtures/posts");
const opts = { dir };

describe("getAllPosts", () => {
  it("sorts by date descending and hides drafts", () => {
    expect(getAllPosts("zh", opts).map((p) => p.slug)).toEqual(["beta", "alpha"]);
  });

  it("includes drafts on request", () => {
    expect(getAllPosts("zh", { dir, includeDrafts: true }).map((p) => p.slug)).toEqual([
      "beta",
      "gamma",
      "alpha",
    ]);
  });

  it("falls back to the other locale instead of dropping the post", () => {
    const beta = getAllPosts("en", opts).find((p) => p.slug === "beta")!;
    expect(beta.isFallback).toBe(true);
    expect(beta.locale).toBe("zh");
    expect(beta.availableLocales).toEqual(["zh"]);
    expect(beta.title).toBe("貝塔");
  });

  it("uses the requested locale when it exists", () => {
    const alpha = getPostMeta("alpha", "en", opts)!;
    expect(alpha.title).toBe("Alpha");
    expect(alpha.isFallback).toBe(false);
    expect(alpha.availableLocales).toEqual(["zh", "en"]);
    expect(alpha.featured).toBe(true);
    expect(alpha.readingMinutes).toBeGreaterThanOrEqual(1);
  });

  it("ignores directories that are not posts", () => {
    expect(getPostMeta("broken-src", "zh", opts)).toBeNull();
  });

  it("fails loudly on invalid frontmatter, naming the file", () => {
    expect(() => getAllPosts("zh", { dir: path.join(dir, "broken-src") })).toThrow(
      /bad\/zh\.mdx[\s\S]*date/,
    );
  });
});

describe("derived queries", () => {
  it("counts tags across visible posts", () => {
    expect(getAllTags("zh", opts)).toEqual([
      { tag: "vision", count: 2 },
      { tag: "cnn", count: 1 },
      { tag: "edge", count: 1 },
    ]);
  });

  it("finds neighbours in date order", () => {
    // list is [beta (newer), alpha (older)]
    expect(getAdjacentPosts("beta", "zh", opts)).toMatchObject({
      newer: null,
      older: { slug: "alpha" },
    });
    expect(getAdjacentPosts("alpha", "zh", opts)).toMatchObject({
      newer: { slug: "beta" },
      older: null,
    });
  });

  it("relates posts by shared tags, never the post itself", () => {
    expect(getRelatedPosts("alpha", "zh", 3, opts).map((p) => p.slug)).toEqual(["beta"]);
  });

  it("builds a toc from the served file", () => {
    expect(getToc("alpha", "zh", opts)).toEqual([
      { depth: 2, text: "第一節", id: "第一節" },
      { depth: 3, text: "小節", id: "小節" },
      { depth: 2, text: "第一節", id: "第一節-1" },
    ]);
    expect(getToc("alpha", "en", opts)).toEqual([
      { depth: 2, text: "Section One", id: "section-one" },
    ]);
  });
});
