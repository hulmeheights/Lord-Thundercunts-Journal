import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The home-screen mark: Meridian's gold diamond on the warm void, inside a hairline frame. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0b" }}>
        <svg width="180" height="180" viewBox="0 0 64 64">
          <rect x="6.5" y="6.5" width="51" height="51" fill="none" stroke="#ece7dd" strokeOpacity="0.16" />
          <path d="M32 17 45 32 32 47 19 32Z" fill="#bd9e63" />
        </svg>
      </div>
    ),
    size,
  );
}
