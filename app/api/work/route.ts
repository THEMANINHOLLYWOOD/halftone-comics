import { after, NextResponse, type NextRequest } from "next/server";
import { workerKeyOk } from "@/lib/auth";
import { assertId } from "@/lib/library";
import { runJob } from "@/lib/pipeline";

// Each background run gets a fresh function with the full time allowance.
export const maxDuration = 300;

/** Internal: the server handing the next part of a comic to a fresh run. */
export async function POST(request: NextRequest) {
  if (!workerKeyOk(request.headers.get("x-worker-key"))) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  const { id, token } = (await request.json()) as { id?: string; token?: string };
  if (!id || !token) return NextResponse.json({ error: "Missing id or token." }, { status: 400 });
  assertId(id);
  after(() => runJob(id, token));
  return NextResponse.json({ ok: true }, { status: 202 });
}
