import { z } from "zod";

const isoDate = z.preprocess(
  // YAML parses bare dates into Date objects; normalise both forms to YYYY-MM-DD.
  (v) => (v instanceof Date && !Number.isNaN(v.getTime()) ? v.toISOString().slice(0, 10) : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
);

export const frontmatterSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  /** Shorter versions for the <title> tag (about 45 characters; the site name is appended) and the meta description (about 155). */
  seoTitle: z.string().min(1).optional(),
  seoDescription: z.string().min(1).optional(),
  date: isoDate,
  updated: isoDate.optional(),
  tags: z.array(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase kebab-case")).default([]),
  no: z.number().int().positive(),
  featured: z.boolean().default(false),
  draft: z.boolean().default(false),
  interactive: z.boolean().default(false),
});

export type Frontmatter = z.infer<typeof frontmatterSchema>;
