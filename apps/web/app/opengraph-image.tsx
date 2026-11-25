import { ImageResponse } from "next/og";

export const alt = "MyClub. Run your amateur club with less chasing.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f6f5f4",
          color: "#000000",
          padding: "80px",
        }}
      >
        <div style={{ display: "flex", fontSize: 32 }}>MyClub</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 64, lineHeight: 1, maxWidth: 860 }}>
            Run your amateur club with less chasing.
          </div>
          <div style={{ display: "flex", fontSize: 28, lineHeight: 1.4, color: "#31302e", maxWidth: 760, marginTop: 24 }}>
            Plan sessions and matches, track player attendance, and manage club finances.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
