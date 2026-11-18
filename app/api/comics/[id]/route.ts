import { NextResponse } from "next/server";
import { denied, fail } from "@/lib/http";
import { getComic, isClassic, trashComic } from "@/lib/library";
import { isActive, reconcile } from "@/lib/pipeline";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const comic = await reconcile(await getComic(id));
    return NextResponse.json({ comic: { ...comic, script: undefined, canRedraw: !!comic.script } });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const refused = denied(request);
    if (refused) return refused;
    const { id } = await params;
    if (isClassic(id)) {
      return NextResponse.json({ error: "That comic cannot be removed here." }, { status: 400 });
    }
    if (await isActive(id)) {
      return NextResponse.json({ error: "This comic is still being drawn." }, { status: 409 });
    }
    await trashComic(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
