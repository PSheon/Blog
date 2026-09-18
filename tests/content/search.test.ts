import { describe, expect, it } from "vitest";
import { type SearchDoc, search, toSections } from "@/lib/search";

describe("toSections", () => {
  const mdx = [
    "import { X } from './x'",
    "",
    "Intro paragraph with **bold** and a [link](https://example.com).<Sidenote>A note.</Sidenote>",
    "",
    '<Instrument fig="01" title="demo" caption="Caption text">',
    "  <X />",
    "</Instrument>",
    "",
    "## 卷積：一個小窗口",
    "",
    "卷積做的事情很簡單。$y = wx$ 是公式。",
    "",
    "```ts",
    "const hidden = 1;",
    "```",
    "",
    "### Sub heading",
    "",
    "- item one",
    "- item two",
  ].join("\n");

  it("splits by heading and keeps readable prose only", () => {
    const sections = toSections(mdx);
    expect(sections.map((s) => [s.id, s.heading])).toEqual([
      ["", ""],
      ["卷積一個小窗口", "卷積：一個小窗口"],
      ["sub-heading", "Sub heading"],
    ]);
    expect(sections[0].text).toBe("Intro paragraph with bold and a link. A note. Caption text");
    expect(sections[1].text).toBe("卷積做的事情很簡單。 是公式。");
    expect(sections[2].text).toBe("item one item two");
  });
});

const docs: SearchDoc[] = [
  {
    slug: "cnn",
    no: 1,
    title: "從零開始的 CNN",
    description: "用 TypeScript 寫卷積神經網路",
    tags: ["computer-vision", "cnn"],
    interactive: true,
    sections: [
      { id: "", heading: "", text: "卷積神經網路的教學通常從一張方塊圖開始。" },
      { id: "pooling", heading: "ReLU 與池化", text: "最大池化把每個 2×2 的區塊換成其中最大的那個值。" },
    ],
  },
  {
    slug: "flappy",
    no: 2,
    title: "Flappy Bird neuroevolution",
    description: "Birds learn to fly",
    tags: ["ai-agent"],
    interactive: true,
    sections: [{ id: "mutation", heading: "Mutation", text: "We randomly alter some connection weights, like a convolution of genes." }],
  },
];

describe("search", () => {
  it("returns nothing for an empty query", () => {
    expect(search(docs, "  ")).toEqual([]);
  });

  it("matches Chinese by substring, without needing word boundaries", () => {
    const hits = search(docs, "池化");
    expect(hits[0]).toMatchObject({ slug: "cnn", sectionId: "pooling", heading: "ReLU 與池化" });
  });

  it("ranks a title match above a body match", () => {
    const hits = search(docs, "cnn");
    expect(hits[0]).toMatchObject({ slug: "cnn", sectionId: "" });
    expect(hits[0].field).toBe("title");
  });

  it("is case-insensitive and finds body text, returning a snippet around the match", () => {
    const [hit] = search(docs, "CONVOLUTION");
    expect(hit.slug).toBe("flappy");
    expect(hit.sectionId).toBe("mutation");
    expect(hit.snippet.toLowerCase()).toContain("convolution");
    expect(hit.ranges.length).toBeGreaterThan(0);
    const [from, to] = hit.ranges[0];
    expect(hit.snippet.slice(from, to).toLowerCase()).toBe("convolution");
  });

  it("requires every term to match somewhere in the same section", () => {
    expect(search(docs, "池化 最大").map((h) => h.sectionId)).toEqual(["pooling"]);
    expect(search(docs, "池化 mutation")).toEqual([]);
  });

  it("matches tags", () => {
    expect(search(docs, "ai-agent")[0]).toMatchObject({ slug: "flappy", field: "tag" });
  });

  it("returns at most one hit per section and caps the list", () => {
    const hits = search(docs, "卷積");
    expect(new Set(hits.map((h) => `${h.slug}#${h.sectionId}`)).size).toBe(hits.length);
    expect(search(docs, "e", 1)).toHaveLength(1);
  });
});
