import { getAllPosts, getPostSource } from "@/lib/content/posts";
import { isLocale, locales } from "@/lib/i18n";
import { type SearchDoc, toSections } from "@/lib/search";

export const dynamic = "force-static";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/** The full-text index, built once at build time and fetched only when someone opens search. */
export async function GET(_: Request, { params }: RouteContext<"/[locale]/search.json">) {
  const { locale } = await params;
  if (!isLocale(locale)) return new Response("Not found", { status: 404 });

  const docs: SearchDoc[] = getAllPosts(locale).map((post) => {
    return {
      slug: post.slug,
      no: post.no,
      title: post.title,
      description: post.description,
      tags: post.tags,
      interactive: post.interactive,
      sections: toSections(getPostSource(post.slug, locale) ?? ""),
    };
  });
  return Response.json(docs);
}
