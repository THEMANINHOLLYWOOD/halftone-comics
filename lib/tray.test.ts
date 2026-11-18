import { expect, test } from "vitest";
import { autoStartArmed, COUNTDOWN_MS, type TrayState } from "./tray";

const base: TrayState = { files: [], links: 0, linkPasted: false, title: "", story: "", detailsOpen: false, busy: false, failed: false };
const done = { done: true, failed: false };

test("the countdown is three seconds", () => {
  expect(COUNTDOWN_MS).toBe(3000);
});

test("arms once every file has finished", () => {
  expect(autoStartArmed({ ...base, files: [done] })).toBe(true);
  expect(autoStartArmed({ ...base, files: [done, { done: false, failed: false }] })).toBe(false);
});

test("never arms on nothing: all failed, or empty", () => {
  expect(autoStartArmed({ ...base, files: [{ done: false, failed: true }] })).toBe(false);
  expect(autoStartArmed(base)).toBe(false);
});

test("a failed file does not block the good ones", () => {
  expect(autoStartArmed({ ...base, files: [done, { done: false, failed: true }] })).toBe(true);
});

test("a pasted link arms; typing or opening + disarms", () => {
  expect(autoStartArmed({ ...base, links: 1, linkPasted: true })).toBe(true);
  expect(autoStartArmed({ ...base, links: 1, linkPasted: false })).toBe(false);
  expect(autoStartArmed({ ...base, files: [done], title: "A" })).toBe(false);
  expect(autoStartArmed({ ...base, files: [done], story: "B" })).toBe(false);
  expect(autoStartArmed({ ...base, files: [done], detailsOpen: true })).toBe(false);
  expect(autoStartArmed({ ...base, files: [done], busy: true })).toBe(false);
});

test("a failed start does not try again on its own", () => {
  expect(autoStartArmed({ ...base, files: [done], failed: true })).toBe(false);
});
