import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

const MAX_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Hands the browser a short-lived token to upload one file straight to the
 * private Blob store, so large videos never pass through a server function.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("uploads/")) throw new Error("Uploads must go in uploads/.");
        return {
          addRandomSuffix: true,
          maximumSizeInBytes: MAX_BYTES,
          // Raw uploads only matter until the comic is made; Blob clears any left behind.
          ttlDays: 2,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
