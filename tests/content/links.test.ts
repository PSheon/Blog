import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getPostMeta } from "@/lib/content/posts";

/** Every .ts and .tsx file under a directory. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("links to articles written into the site's own code", () => {
  it("point at articles that exist and are published", () => {
    // The home page's hero names four articles by slug, and other components may name more. A renamed article would
    // leave such a link dead without a word from the compiler: a slug in a template string is only a string.
    const named = new Map<string, string>();
    for (const file of [...sources("app"), ...sources("components")])
      for (const match of readFileSync(file, "utf8").matchAll(/\/posts\/([a-z0-9]+(?:-[a-z0-9]+)+)(?=[`"'/#?])/g)) named.set(match[1], file);
    expect(named.size).toBeGreaterThan(0);
    for (const [slug, file] of named) expect(getPostMeta(slug, "zh", { includeDrafts: false }), `${file} links to /posts/${slug}`).not.toBeNull();
  });
});
