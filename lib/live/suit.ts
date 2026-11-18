// Suiting up: everyone arrives as a dormant hero, and their first press
// anywhere on the page turns it on. That first press is only the suit-up.

/** How long after suiting up a tap still counts as the press that did it. */
export const SUIT_TAP_MS = 450;

/** Is this tap on the comic the suit-up (rather than a power)? `suitedAt` is null until suited. */
export function isSuitUpTap(suitedAt: number | null, now: number): boolean {
  return suitedAt === null || now - suitedAt < SUIT_TAP_MS;
}
