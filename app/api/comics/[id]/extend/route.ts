import { after, NextResponse } from "next/server";
import { apiKey } from "@/lib/gemini";
import { fail, selfOrigin } from "@/lib/http";
import { hasMaterial, readMaterial } from "@/lib/material";
import { extendComic, runJob } from "@/lib/pipeline";

export const maxDuration = 300;

type Context = { params: Promise<{ id: string }> };

/** Add pages to a finished comic from more photos, links or a story: a single becomes a book. */
export async function POST(request: Request, { params }: Context) {
  try {
    if (!apiKey()) {
      return NextResponse.json({ error: "This server cannot write scripts right now." }, { status: 400 });
    }
    const { id } = await params;
    const material = readMaterial(await request.json().catch(() => ({})));
    if (!hasMaterial(material)) {
      return NextResponse.json({ error: "Add a photo, a link or a few words to build on." }, { status: 400 });
    }
    const { comic, token } = await extendComic(id, material, selfOrigin(request));
    after(() => runJob(id, token));
    return NextResponse.json({ comic });
  } catch (error) {
    return fail(error, 400);
  }
}
