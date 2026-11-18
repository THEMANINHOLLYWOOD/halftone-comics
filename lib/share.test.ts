import { expect, test } from "vitest";
import { comicPath, parseComicPath, shareMeta } from "./share";
import type { Comic } from "./types";

function comic(over: Partial<Comic> = {}): Comic {
  return { id: "x", title: "CAT PATROL", tagline: "Nine lives", era: "newsstand", collection: "new", createdAt: "", status: "ready", pages: [], ...over };
}

test("comicPath and parseComicPath round-trip real ids", () => {
  expect(comicPath("20261117-cat-patrol-ab12")).toBe("/c/20261117-cat-patrol-ab12");
  expect(parseComicPath("/c/20261117-cat-patrol-ab12")).toBe("20261117-cat-patrol-ab12");
});

test("parseComicPath refuses anything that is not a comic id", () => {
  expect(parseComicPath("/c/../secrets")).toBeNull();
  expect(parseComicPath("/c/")).toBeNull();
  expect(parseComicPath("/")).toBeNull();
  expect(parseComicPath("/c/a/b")).toBeNull();
  expect(parseComicPath("/c/UPPER")).toBeNull();
});

test("shareMeta prefers the painted poster and is always absolute", () => {
  const painted = shareMeta(comic({ share: { status: "ready", url: "/api/files/comics/x/share.r1.jpg" } }));
  expect(painted.image).toBe("https://comics.inchipala.com/api/files/comics/x/share.r1.jpg");
  expect(shareMeta(comic({ share: { status: "pending" } })).image).toBe("https://comics.inchipala.com/api/og/x");
  expect(shareMeta(comic()).image).toBe("https://comics.inchipala.com/api/og/x");
});

test("shareMeta words the card", () => {
  const meta = shareMeta(comic());
  expect(meta.title).toBe("CAT PATROL");
  expect(meta.description).toContain("Nine lives");
});
