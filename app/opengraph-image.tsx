import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

export const alt = `${BRAND.line}: anything can be a comic`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The site's own card: one moment taken apart and rebuilt as comics in every style. */
export default async function OpenGraphImage() {
  const [art, anton] = await Promise.all([
    readFile(join(process.cwd(), "public/og-art.jpg")),
    readFile(join(process.cwd(), "assets/Anton-Regular.ttf")),
  ]);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#f4f4f2" }}>
        <img
          src={`data:image/jpeg;base64,${art.toString("base64")}`}
          width={1200}
          height={630}
          alt=""
          style={{ position: "absolute", inset: 0, objectFit: "cover" }}
        />
        <div
          style={{
            position: "absolute",
            left: 48,
            bottom: 44,
            display: "flex",
            flexDirection: "column",
            padding: "26px 34px 28px",
            background: "#fbfbf9",
            border: "4px solid #141414",
            boxShadow: "10px 10px 0 #141414",
            transform: "rotate(-1.5deg)",
          }}
        >
          <div style={{ display: "flex", fontFamily: "Anton", fontSize: 84, lineHeight: 0.92, color: "#141414", textTransform: "uppercase" }}>
            Anything can
          </div>
          <div style={{ display: "flex", fontFamily: "Anton", fontSize: 84, lineHeight: 0.92, color: "#e4007c", textTransform: "uppercase" }}>
            be a comic.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
            <div style={{ display: "flex", background: "#141414", color: "#fbfbf9", fontSize: 28, fontWeight: 900, letterSpacing: -1.4, padding: "5px 11px", borderRadius: 6 }}>
              {BRAND.name}
            </div>
            <div style={{ display: "flex", fontSize: 21, letterSpacing: 4, color: "#141414" }}>{BRAND.line}</div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Anton", data: anton, style: "normal", weight: 400 }] },
  );
}
