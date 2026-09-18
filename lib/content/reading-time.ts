const CJK = /[㐀-鿿豈-﫿぀-ヿ]/g;
const CJK_PER_MIN = 400;
const WORDS_PER_MIN = 220;

/** Prose only: frontmatter, code, imports and JSX are not something you read at pace. */
function prose(source: string): string {
  return source
    .replace(/^---\n[\s\S]*?\n---\n?/, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^(import|export)\s.*$/gm, "")
    .replace(/<[^>]+>/g, " ");
}

export function readingMinutes(source: string): number {
  const text = prose(source);
  const cjk = text.match(CJK)?.length ?? 0;
  const words = text.replace(CJK, " ").match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0;
  return Math.max(1, Math.ceil(cjk / CJK_PER_MIN + words / WORDS_PER_MIN));
}
