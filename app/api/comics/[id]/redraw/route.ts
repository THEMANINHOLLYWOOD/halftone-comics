import { after, NextResponse } from "next/server";
import { fail, selfOrigin } from "@/lib/http";
import { redrawFailed, runJob } from "@/lib/pipeline";

export const maxDuration = 300;

type Context = { params: Promise<{ id: string }> };

/** Draw every sheet of this comic that failed, from its saved script and stills. */
export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    // Only the admin picks a model; everyone else redraws with the comic's own.
    const artist = undefined as string | undefined;
    const { comic, token } = await redrawFailed(id, selfOrigin(request), artist);
    after(() => runJob(id, token));
    return NextResponse.json({ comic });
  } catch (error) {
    return fail(error, 400);
  }
}
