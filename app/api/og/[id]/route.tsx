import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";
import { getEra } from "@/lib/eras";
import { getComic } from "@/lib/library";
import { COMIC_ID } from "@/lib/share";
import { readBytes } from "@/lib/storage";

type Context = { params: Promise<{ id: string }> };

const anton = readFile(join(process.cwd(), "assets/Anton-Regular.ttf"));

/**
 * The share card for comics without a painted poster (older ones, or before
 * the poster lands): the cover laid on halftone paper with its title.
 */
export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  if (!COMIC_ID.test(id)) return new Response("Not found", { status: 404 });
  let comic;
  try {
    comic = await getComic(id);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const cover = comic.pages.find((p) => p.kind === "cover" && p.status === "ready")?.urls?.w640;
  // Read the cover straight from storage: fetching our own URL from inside a request is slow and fragile.
  const bytes = cover?.startsWith("/api/files/") ? await readBytes(decodeURIComponent(cover.slice("/api/files/".length))) : null;
  const coverUrl = bytes
    ? `data:image/jpeg;base64,${bytes.toString("base64")}`
    : cover
      ? cover.startsWith("http")
        ? cover
        : `${new URL(request.url).origin}${cover}`
      : null;
  const title = comic.title.length > 28 ? `${comic.title.slice(0, 27)}…` : comic.title;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          background: "#f4f4f2",
          backgroundImage: "radial-gradient(circle, rgba(20,20,20,0.09) 1.6px, transparent 1.8px)",
          backgroundSize: "16px 16px",
          padding: "0 70px",
          gap: 64,
        }}
      >
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- rendered to an image by next/og
          <img
            src={coverUrl}
            width={340}
            height={510}
            alt=""
            style={{
              transform: "rotate(-4deg)",
              border: "10px solid #fbfbf9",
              boxShadow: "0 30px 60px -20px rgba(0,0,0,0.45)",
              objectFit: "cover",
            }}
          />
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", fontSize: 22, letterSpacing: 6, color: "#6a6a65", textTransform: "uppercase" }}>
            {getEra(comic.era).name} · No. {comic.issue ?? 1}
          </div>
          <div style={{ display: "flex", fontFamily: "Anton", fontSize: 104, lineHeight: 0.95, color: "#141414", marginTop: 14, textTransform: "uppercase" }}>
            {title}
          </div>
          {comic.tagline ? (
            <div style={{ display: "flex", fontSize: 30, color: "#141414", marginTop: 18, maxWidth: 620 }}>{comic.tagline}</div>
          ) : null}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 44 }}>
            <div style={{ display: "flex", background: "#141414", color: "#fbfbf9", fontSize: 30, fontWeight: 900, letterSpacing: -1.5, padding: "6px 12px", borderRadius: 7 }}>
              {BRAND.name}
            </div>
            <div style={{ display: "flex", fontSize: 22, letterSpacing: 4, color: "#141414" }}>{BRAND.line}</div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [{ name: "Anton", data: await anton, style: "normal", weight: 400 }],
      headers: { "cache-control": "public, max-age=600, s-maxage=3600" },
    },
  );
}
