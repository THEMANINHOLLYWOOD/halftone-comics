import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { IMPRINT } from "./eras";

// The site is for everyone: nothing personal to its owner ships in it.
const PERSONAL = /andres|andycruz|gmail\.com|tyler|bohdan|likescomics/i;
const SHIPPED = ["app", "components", "lib", "public"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx|css|json|svg|txt)$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

test("no personal names or studio branding in anything that ships", () => {
  const hits = SHIPPED.flatMap(files).filter((path) => PERSONAL.test(readFileSync(path, "utf8")));
  expect(hits).toEqual([]);
});

test("the imprint is neutral", () => {
  expect(IMPRINT).not.toMatch(PERSONAL);
});
