import { describe, expect, it } from "vitest";
import { readingMinutes } from "@/lib/content/reading-time";
import { extractToc } from "@/lib/content/toc";
import { isLocale, pickLocale } from "@/lib/i18n/config";

describe("readingMinutes", () => {
  it("counts CJK at 400 chars/min", () => {
    expect(readingMinutes("字".repeat(800))).toBe(2);
  });
  it("counts Latin at 220 words/min", () => {
    expect(readingMinutes(Array(440).fill("word").join(" "))).toBe(2);
  });
  it("adds mixed text and rounds up", () => {
    expect(readingMinutes("字".repeat(400) + " " + Array(230).fill("w").join(" "))).toBe(3);
  });
  it("never returns less than one minute", () => {
    expect(readingMinutes("")).toBe(1);
  });
  it("ignores frontmatter, code fences, imports and JSX tags", () => {
    const src = [
      "---",
      "title: " + "字".repeat(2000),
      "---",
      "import { X } from './x'",
      "```ts",
      "字".repeat(2000),
      "```",
      '<Instrument fig="01" title="' + "字".repeat(2000) + '" />',
      "字".repeat(400),
    ].join("\n");
    expect(readingMinutes(src)).toBe(1);
  });
});

describe("extractToc", () => {
  it("keeps h2/h3, strips inline markup, skips fenced code", () => {
    const src = "# Title\n## One `code` **bold**\n```\n## nope\n```\n### [Link](http://x) two\n#### deep";
    expect(extractToc(src)).toEqual([
      { depth: 2, text: "One code bold", id: "one-code-bold" },
      { depth: 3, text: "Link two", id: "link-two" },
    ]);
  });
});

describe("locale helpers", () => {
  it("validates locales", () => {
    expect(isLocale("zh")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });
  it("picks a locale from Accept-Language", () => {
    expect(pickLocale("en-US,en;q=0.9")).toBe("en");
    expect(pickLocale("zh-TW,zh;q=0.9,en;q=0.8")).toBe("zh");
    expect(pickLocale("fr-FR,en;q=0.5,zh;q=0.4")).toBe("en");
    expect(pickLocale("ja-JP")).toBe("zh");
    expect(pickLocale(null)).toBe("zh");
  });
});
