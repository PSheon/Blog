/**
 * Full-text search over the notebook. Pure and dependency-free, so the same code builds
 * the index on the server and ranks results in the browser.
 *
 * Matching is by case-insensitive substring, not by word: Chinese has no spaces, and
 * fuzzy scorers tuned for English rank it badly.
 */
import GithubSlugger from "github-slugger";

export interface SearchSection {
  /** Heading anchor, or "" for the text before the first heading. */
  id: string;
  heading: string;
  text: string;
}

export interface SearchDoc {
  slug: string;
  no: number;
  title: string;
  description: string;
  tags: string[];
  interactive: boolean;
  sections: SearchSection[];
}

export interface SearchHit {
  slug: string;
  no: number;
  title: string;
  interactive: boolean;
  sectionId: string;
  heading: string;
  /** Where the best match was found; drives ranking and the result's label. */
  field: "title" | "tag" | "heading" | "description" | "body";
  snippet: string;
  /** [from, to) character ranges inside `snippet` to highlight. */
  ranges: [number, number][];
  score: number;
}

function plain(markdown: string): string {
  return markdown
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]+\$/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(caption|title)="([^"]*)"/g, (_, key, value) => (key === "caption" ? `>${value}<` : ""))
    .replace(/<[^>]*>/g, " ")
    .replace(/^\s*(?:[-*]|\d+\.)\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\|/g, " ")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([。，、；：！？.,;:!?])/g, "$1")
    .trim();
}

/** Split an MDX body into searchable sections, one per h2/h3, dropping code, imports and markup. */
export function toSections(source: string): SearchSection[] {
  const slugger = new GithubSlugger();
  const sections: SearchSection[] = [{ id: "", heading: "", text: "" }];
  const buffer: string[] = [];
  let inFence = false;

  const flush = () => {
    sections[sections.length - 1].text = plain(buffer.join("\n"));
    buffer.length = 0;
  };

  for (const line of source.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || /^(import|export)\s/.test(line)) continue;
    const m = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (!m) {
      buffer.push(line);
      continue;
    }
    const heading = plain(m[2]);
    const id = slugger.slug(heading); // slug every heading so ids stay aligned with rehype-slug
    if (m[1].length === 2 || m[1].length === 3) {
      flush();
      sections.push({ id, heading, text: "" });
    }
  }
  flush();
  return sections.filter((s, i) => i === 0 || s.text || s.heading);
}

const WEIGHT = { title: 100, tag: 60, heading: 50, description: 30, body: 10 } as const;
const SNIPPET = 96;

function indexesOf(haystack: string, needle: string): number[] {
  const out: number[] = [];
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) out.push(i);
  return out;
}

/** Cut a window of text around the first match and report where every term falls inside it. */
function excerpt(text: string, terms: string[]): Pick<SearchHit, "snippet" | "ranges"> {
  const lower = text.toLowerCase();
  const first = Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0), Infinity);
  let start = Number.isFinite(first) ? Math.max(0, first - 24) : 0;
  // Don't start in the middle of a Latin word.
  while (start > 0 && /[A-Za-z0-9]/.test(text[start - 1]) && /[A-Za-z0-9]/.test(text[start])) start--;
  const end = Math.min(text.length, start + SNIPPET);
  const prefix = start > 0 ? "…" : "";
  const snippet = prefix + text.slice(start, end) + (end < text.length ? "…" : "");
  const window = snippet.toLowerCase();
  const ranges = terms
    .flatMap((t) => indexesOf(window, t).map((i): [number, number] => [i, i + t.length]))
    .sort((a, b) => a[0] - b[0]);
  return { snippet, ranges };
}

export function search(docs: SearchDoc[], query: string, limit = 12): SearchHit[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const hits: SearchHit[] = [];

  for (const doc of docs) {
    const title = doc.title.toLowerCase();
    const description = doc.description.toLowerCase();
    const tags = doc.tags.join(" ").toLowerCase();

    doc.sections.forEach((section, index) => {
      const heading = section.heading.toLowerCase();
      const body = section.text.toLowerCase();
      // Post-level fields belong to the opening section only, so a title match yields one hit, not one per section.
      const fields: [SearchHit["field"], string][] =
        index === 0
          ? [["title", title], ["tag", tags], ["description", description], ["body", body]]
          : [["heading", heading], ["body", body]];

      let score = 0;
      let best: SearchHit["field"] | null = null;
      for (const term of terms) {
        const found = fields.find(([, value]) => value.includes(term));
        if (!found) return; // every term must match within this section
        score += WEIGHT[found[0]] + (found[1].startsWith(term) ? 5 : 0);
        if (!best || WEIGHT[found[0]] > WEIGHT[best]) best = found[0];
      }

      const source = best === "body" ? section.text : best === "heading" ? section.text || section.heading : doc.description;
      hits.push({
        slug: doc.slug,
        no: doc.no,
        title: doc.title,
        interactive: doc.interactive,
        sectionId: section.id,
        heading: section.heading,
        field: best!,
        score,
        ...excerpt(source, terms),
      });
    });
  }

  return hits.sort((a, b) => b.score - a.score || b.no - a.no).slice(0, limit);
}
