import { connection, NextResponse } from "next/server";
import { studioLocked } from "@/lib/auth";
import { serverKeys } from "@/lib/draw";
import { apiKey } from "@/lib/gemini";
import { fail } from "@/lib/http";
import { listComics } from "@/lib/library";
import { reconcile } from "@/lib/pipeline";
import { storageKind } from "@/lib/storage";
import type { Comic, StudioInfo } from "@/lib/types";
import { hasFfmpeg } from "@/lib/video";

// The shelf only needs enough of each comic to show its sheets.
function summary(comic: Comic): Comic {
  return { ...comic, script: undefined, canRedraw: !!comic.script };
}

export async function GET() {
  // Always read the library fresh: it changes while comics are being drawn.
  await connection();
  try {
    const comics = await Promise.all((await listComics()).map(reconcile));
    const info: StudioInfo = {
      hasKey: !!apiKey(),
      hasFfmpeg: await hasFfmpeg(),
      storage: storageKind(),
      locked: studioLocked(),
      keys: serverKeys(),
    };
    return NextResponse.json({ comics: comics.map(summary), info });
  } catch (error) {
    return fail(error);
  }
}
