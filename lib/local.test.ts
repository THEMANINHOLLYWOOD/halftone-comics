import { expect, test } from "vitest";
import { isMade, isOpened, markMade, markOpened } from "./local";

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

test("opened and made comics are remembered per id", () => {
  const store = memory();
  expect(isOpened("a", store)).toBe(false);
  markOpened("a", store);
  expect(isOpened("a", store)).toBe(true);
  expect(isOpened("b", store)).toBe(false);
  markMade("c", store);
  expect(isMade("c", store)).toBe(true);
});

test("local memory survives a throwing store", () => {
  const broken = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); } };
  expect(isOpened("a", broken)).toBe(false);
  expect(() => markOpened("a", broken)).not.toThrow();
});
