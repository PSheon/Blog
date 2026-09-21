import { NotFoundBody } from "@/components/site/not-found-body";
import { getDictionary } from "@/lib/i18n";

// not-found is given no params. The body reads the language from the URL instead (see NotFoundBody).
export default function NotFound() {
  return <NotFoundBody zh={getDictionary("zh").notFound} en={getDictionary("en").notFound} />;
}
