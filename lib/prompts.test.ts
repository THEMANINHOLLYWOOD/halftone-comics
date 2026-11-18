import { expect, test } from "vitest";
import { cleanTitle, scriptRequest } from "./prompts";

test("cleanTitle trims, collapses spaces, drops control chars and caps at 60", () => {
  expect(cleanTitle("  The   Night\u0007 Shift ")).toBe("The Night Shift");
  expect(cleanTitle("x".repeat(80))).toHaveLength(60);
  expect(cleanTitle("   ")).toBeUndefined();
  expect(cleanTitle(42)).toBeUndefined();
});

test("scriptRequest pins a given title", () => {
  expect(scriptRequest("", [], "Cat Patrol")).toContain('The title is fixed: "Cat Patrol"');
  expect(scriptRequest("", [])).not.toContain("The title is fixed");
});
