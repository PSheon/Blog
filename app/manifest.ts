import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

/** Lets the notebook be added to a home screen; the colours and icon also give the system launch screen for free. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${site.name} — 從零實作機器學習模型`,
    short_name: site.name,
    description: "從零實作機器學習模型，每一篇都能在瀏覽器裡訓練、拆開、弄壞。",
    lang: "zh-Hant-TW",
    // A stable identity for the installed app, whatever the start URL becomes later.
    id: "/",
    // "/" redirects by language. A redirect cannot be cached, so offline the worker answers it with the cached home page.
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#070918",
    theme_color: "#070918",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
