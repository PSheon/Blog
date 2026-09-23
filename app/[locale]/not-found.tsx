import { NotFoundBody } from "@/components/site/not-found-body";
import { getAllPosts } from "@/lib/content/posts";
import { type Locale, getDictionary } from "@/lib/i18n";

/** Title and number only: enough to recognise an article, and nothing else to ship. */
const latest = (locale: Locale) => getAllPosts(locale).slice(0, 5).map((p) => ({ slug: p.slug, no: p.no, title: p.title }));

// not-found is given no params. The body reads the language from the URL instead (see NotFoundBody).
export default function NotFound() {
  return (
    <NotFoundBody
      zh={{ ...getDictionary("zh").notFound, posts: latest("zh") }}
      en={{ ...getDictionary("en").notFound, posts: latest("en") }}
    />
  );
}
