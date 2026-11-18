import { after, NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/admin";
import { apiKey } from "@/lib/gemini";
import { fail, selfOrigin } from "@/lib/http";
import { hasMaterial, readMaterial } from "@/lib/material";
import { runJob, startComic } from "@/lib/pipeline";

export const maxDuration = 300;

/** Starts a comic and returns straight away; the studio polls it as sheets arrive. */
export async function POST(request: NextRequest) {
  try {
    if (!apiKey()) {
      return NextResponse.json({ error: "This server has no GEMINI_API_KEY, so it cannot draw." }, { status: 400 });
    }
    const job = readMaterial(await request.json().catch(() => ({})), { admin: await isAdmin(request) });
    if (!hasMaterial(job)) {
      return NextResponse.json(
        { error: "Give it something to work from: a title, a story, a photo, a video or a link." },
        { status: 400 },
      );
    }
    const { comic, token } = await startComic(job, selfOrigin(request));
    after(() => runJob(comic.id, token));
    return NextResponse.json({ comic });
  } catch (error) {
    return fail(error, 400);
  }
}
