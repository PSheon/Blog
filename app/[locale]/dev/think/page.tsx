import { notFound } from "next/navigation";
import { ThinkVariants } from "./variants";

export const metadata = { title: "think / layouts", robots: { index: false, follow: false } };

/**
 * A comparison bench, `next dev` only: the four candidate shapes for the hero's "think" station side by side at
 * phone width, each with the numbers that were measured for it. It exists so a choice between them can be made by
 * looking rather than by reading a table, and it never ships.
 */
export default function DevThink() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ThinkVariants />;
}
