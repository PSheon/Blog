import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

/** Lets the notebook be added to a home screen; the colours and icon also give the system launch screen for free. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${site.name} — 從零實作機器學習模型`,
    short_name: site.name,
    description: "Machine learning models built from scratch that you can train, take apart and break in your browser.",
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
