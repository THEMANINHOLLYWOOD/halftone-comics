import type { NextRequest } from "next/server";
import { fail } from "@/lib/http";
import { NotFoundError } from "@/lib/library";
import { readBytes } from "@/lib/storage";

type Context = { params: Promise<{ path: string[] }> };

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/**
 * Serves drawn sheets from storage (the private Blob store on Vercel, the
 * library folder locally). Every redraw gets a new file name, so responses
 * never change and Vercel's CDN keeps them after the first request.
 */
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const parts = (await params).path;
    const file = parts.join("/");
    const type = TYPES[file.split(".").pop()?.toLowerCase() ?? ""];
    // Only published sheets, never the private folder or uploads.
    if (parts[0] !== "comics" || !type) throw new NotFoundError(`Unknown file: ${file}`);
    const data = await readBytes(file);
    if (!data) throw new NotFoundError(`Unknown file: ${file}`);

    const headers = new Headers({
      "content-type": type,
      "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable",
    });
    const download = request.nextUrl.searchParams.get("download");
    if (download) {
      const name = download.replace(/[^\w .()-]+/g, "").trim() || "comic";
      headers.set("content-disposition", `attachment; filename="${name}.${file.split(".").pop()}"`);
    }
    return new Response(new Uint8Array(data), { headers });
  } catch (error) {
    return fail(error);
  }
}
