// How often to send where your hero is: never while alone, and less often as a
// room fills, so the whole room stays inside a small, fixed message budget.

export function sendRate(people: number): number {
  if (people <= 1) return 0;
  return Math.min(Math.max(24 / people, 2), 12);
}
