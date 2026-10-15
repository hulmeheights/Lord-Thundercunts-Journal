import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #64d2ff 0%, #5e5ce6 45%, #bf5af2 100%)",
        }}
      >
        <svg width="112" height="112" viewBox="0 0 64 64">
          <path d="M36.5 9 17 36h12.5L26 55l21-29H34.2L36.5 9Z" fill="#fff" />
        </svg>
      </div>
    ),
    size,
  );
}
