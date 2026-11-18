// Who may change the library, and the secrets that keep private files private.
//
// Reading, making and redrawing comics is open to everyone. Removing a comic
// from the shelf is not: when STUDIO_PASSCODE is set, that request must carry
// it in the `x-studio-passcode` header.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function studioLocked(): boolean {
  return !!process.env.STUDIO_PASSCODE;
}

const digest = (value: string) => createHash("sha256").update(value).digest();

export function passcodeOk(given: string | null | undefined): boolean {
  const want = process.env.STUDIO_PASSCODE;
  if (!want) return true;
  return timingSafeEqual(digest(given ?? ""), digest(want));
}

export function requestPasscodeOk(request: Request): boolean {
  return passcodeOk(request.headers.get("x-studio-passcode"));
}

function secret(): string {
  // Locally nothing is public, so a fixed value is fine there.
  return process.env.COMIC_SECRET || "local-development-only";
}

/**
 * The folder holding a comic's private files (its job record and the stills
 * taken from someone's video). Public comic paths are guessable from the
 * title; this one is not without the secret.
 */
export function privateFolder(id: string): string {
  const key = createHmac("sha256", secret()).update(`private:${id}`).digest("hex").slice(0, 32);
  return `private/${key}`;
}

/** Shared by the server's own background steps when they hand work to each other. */
export function workerKey(): string {
  return createHmac("sha256", secret()).update("worker").digest("hex");
}

export function workerKeyOk(given: string | null): boolean {
  return timingSafeEqual(digest(given ?? ""), digest(workerKey()));
}
