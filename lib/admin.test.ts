import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { emailMatches } from "./admin";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

test("the admin email matches its hash, whatever the case or spacing", () => {
  const stored = hash("someone@example.com");
  expect(emailMatches("someone@example.com", stored)).toBe(true);
  expect(emailMatches("  Someone@Example.com ", stored)).toBe(true);
});

test("anything else is not the admin", () => {
  const stored = hash("someone@example.com");
  expect(emailMatches("other@example.com", stored)).toBe(false);
  expect(emailMatches("", stored)).toBe(false);
  expect(emailMatches("someone@example.com", undefined)).toBe(false);
  expect(emailMatches("someone@example.com", "")).toBe(false);
});

test("several admins can be listed, comma separated", () => {
  const stored = `${hash("a@example.com")},${hash("b@example.com")}`;
  expect(emailMatches("b@example.com", stored)).toBe(true);
});
