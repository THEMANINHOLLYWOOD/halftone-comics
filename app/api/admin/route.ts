import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";

/** Whether the signed-in person is the admin. */
export async function GET(request: Request) {
  return NextResponse.json({ admin: await isAdmin(request) }, { headers: { "cache-control": "no-store" } });
}
