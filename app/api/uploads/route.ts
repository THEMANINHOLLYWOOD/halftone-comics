import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebStream } from "node:stream/web";
import { NextResponse, type NextRequest } from "next/server";
import { fail } from "@/lib/http";
import { classify } from "@/lib/sources";
import { LIBRARY_DIR, storageKind } from "@/lib/storage";
import type { UploadRef } from "@/lib/types";

const MAX_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Local development only: takes one file as the raw request body (name in
 * `x-file-name`) and streams it to library/uploads. On Vercel the browser
 * uploads straight to Blob instead (see ./blob/route.ts).
 */
export async function POST(request: NextRequest) {
  if (storageKind() !== "local") {
    return NextResponse.json({ error: "Uploads go straight to storage on this server." }, { status: 400 });
  }
  const id = randomUUID();
  const dir = path.join(LIBRARY_DIR, "uploads", id);
  try {
    if (!request.body) return NextResponse.json({ error: "No file was sent." }, { status: 400 });
    const name = decodeURIComponent(request.headers.get("x-file-name") ?? "file").slice(0, 200);
    const { mime } = classify(name, request.headers.get("content-type") ?? "");

    await mkdir(dir, { recursive: true });
    let size = 0;
    const counted = async function* (body: AsyncIterable<Uint8Array>) {
      for await (const chunk of body) {
        size += chunk.byteLength;
        if (size > MAX_BYTES) throw new Error("That file is over 2 GB, which is more than Gemini accepts.");
        yield chunk;
      }
    };
    await pipeline(
      Readable.from(counted(Readable.fromWeb(request.body as unknown as WebStream<Uint8Array>))),
      createWriteStream(path.join(dir, "file")),
    );
    if (!size) throw new Error("That file is empty.");

    const upload: UploadRef = { ref: `uploads/${id}`, name, mime, size };
    return NextResponse.json({ upload });
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    return fail(error, 400);
  }
}
