"use client";

import dynamic from "next/dynamic";

function Tiles() {
  return (
    <div className="grid grid-cols-4 gap-1" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="aspect-square w-full border border-border" />
      ))}
    </div>
  );
}

// The preview shares the classifier's store, which drags in the model code: load it after hydration.
const CnnPreview = dynamic(() => import("./cnn-preview"), { ssr: false, loading: () => <Tiles /> });

/** Live thumbnails, keyed by post slug. Keep lib/content/previews.ts in sync. */
const postPreviews: Record<string, React.ComponentType> = {
  "cnn-from-scratch": CnnPreview,
};

export function PostPreview({ slug }: { slug: string }) {
  const Preview = postPreviews[slug];
  return Preview ? <Preview /> : null;
}
