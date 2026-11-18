import { after, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { MODEL_ID } from "@/lib/artists";
import { fail, selfOrigin } from "@/lib/http";
import { cleanMarks } from "@/lib/marks";
import { redrawPage, runJob } from "@/lib/pipeline";

export const maxDuration = 300;

type Context = { params: Promise<{ id: string; pageId: string }> };

/** Draw one sheet again from the comic's saved script and stills. */
export async function POST(request: Request, { params }: Context) {
  try {
    const { id, pageId } = await params;
    const body = (await request.json().catch(() => ({}))) as { prompt?: unknown; marks?: unknown; artist?: unknown };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 1000) : "";
    const change = prompt ? { prompt, marks: cleanMarks(body.marks) } : undefined;
    // Only the admin picks a model; everyone else redraws with the comic's own.
    const artist = typeof body.artist === "string" && MODEL_ID.test(body.artist) && (await isAdmin(request)) ? body.artist : undefined;
    const { comic, token } = await redrawPage(id, pageId, selfOrigin(request), artist, change);
    after(() => runJob(id, token));
    return NextResponse.json({ comic });
  } catch (error) {
    return fail(error, 400);
  }
}
