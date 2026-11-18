import { expect, test } from "vitest";
import { isSuitUpTap, SUIT_TAP_MS } from "./suit";

test("before suiting up, a tap on the comic is the suit-up", () => {
  expect(isSuitUpTap(null, 1000)).toBe(true);
});

test("the press that suited you up does not also fire a power", () => {
  // The press suits up on the way down; the comic hears the same tap on the way up.
  expect(isSuitUpTap(1000, 1000 + 120)).toBe(true);
  expect(isSuitUpTap(1000, 1000 + SUIT_TAP_MS - 1)).toBe(true);
});

test("once suited, later taps are powers", () => {
  expect(isSuitUpTap(1000, 1000 + SUIT_TAP_MS + 1)).toBe(false);
  expect(isSuitUpTap(1000, 60_000)).toBe(false);
});
