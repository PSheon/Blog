import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const LEVELS = [0.3, 0.6, 0.3, 0.6, 1, 0.6, 0.3, 0.6, 0.3];

/** The 3×3 mark of `icon.svg` as a PNG: iOS ignores SVG icons when a page is added to the home screen. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexWrap: "wrap", alignContent: "center", justifyContent: "center", gap: 14, padding: 34, background: "#070918" }}>
        {LEVELS.map((opacity, i) => (
          <div key={i} style={{ width: 28, height: 28, background: "#79dafa", opacity }} />
        ))}
      </div>
    ),
    size,
  );
}
