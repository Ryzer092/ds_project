import { ImageResponse } from "next/og";

export const alt = "Next AI Agent — AI shopping assistant";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** 独自のOG画像。外部フォントを読み込まないため、文字は英字のみで構成する。 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#F3F8F1",
          color: "#142B1E",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "#17663A", display: "flex" }} />
          <div style={{ fontSize: 40, fontWeight: 700 }}>Next AI Agent</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 28, letterSpacing: 4, color: "#17663A", fontWeight: 700 }}>AI SHOPPING ASSISTANT</div>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1 }}>Start shopping from what you want.</div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {["Budget", "Size", "Color", "Save & search again"].map((t) => (
            <div key={t} style={{ fontSize: 26, padding: "10px 22px", borderRadius: 999, background: "#fff", border: "2px solid #DEE7DE" }}>
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
