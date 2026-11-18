// The admin: a signed-in person whose email matches ADMIN_EMAIL_SHA256 (a
// SHA-256 of the lowercased address, comma-separated for more than one).
// Only the hash is configured, so the address itself never ships.

import { createHash, timingSafeEqual } from "node:crypto";

export function emailMatches(email: string, hashes: string | undefined): boolean {
  const clean = email.trim().toLowerCase();
  if (!clean || !hashes) return false;
  const mine = createHash("sha256").update(clean).digest();
  return hashes
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^[0-9a-f]{64}$/.test(h))
    .some((h) => timingSafeEqual(Buffer.from(h, "hex"), mine));
}

/** Who signed in, from their Supabase access token. */
async function signedInEmail(request: Request): Promise<string | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!token || !url || !key) return null;
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { email?: string };
    return user.email ?? null;
  } catch {
    return null;
  }
}

export async function isAdmin(request: Request): Promise<boolean> {
  const email = await signedInEmail(request);
  return !!email && emailMatches(email, process.env.ADMIN_EMAIL_SHA256);
}
