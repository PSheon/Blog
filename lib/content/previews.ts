/**
 * Posts that have a live thumbnail. Kept outside the client module so server
 * components can ask; the components themselves live in components/site/post-previews.tsx.
 */
const previewSlugs = new Set(["cnn-from-scratch", "diffusion-points"]);

export function hasPreview(slug: string): boolean {
  return previewSlugs.has(slug);
}
