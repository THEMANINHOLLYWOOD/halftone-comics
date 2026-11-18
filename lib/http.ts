import { NextResponse } from "next/server";
import { requestPasscodeOk } from "./auth";
import { NotFoundError } from "./library";

export function fail(error: unknown, status = 500): NextResponse {
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

/** A response to send back when the request may not remove comics, or null. */
export function denied(request: Request): NextResponse | null {
  if (requestPasscodeOk(request)) return null;
  return NextResponse.json({ error: "That studio passcode is not right.", passcode: true }, { status: 401 });
}

/**
 * Where this app can reach itself to hand background work on: the address
 * the request came in on. On Vercel that is the public domain the visitor
 * used, which is never behind Vercel's deployment login.
 */
export function selfOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}
