import { expect, test } from "vitest";
import { appendPages, isSingle } from "./pipeline";
import { continuationRequest, pageRange } from "./prompts";
import type { ComicPage, ComicScript, GenerateRequest } from "./types";

const photo = { ref: "uploads/a/file", name: "me.jpg", mime: "image/jpeg", size: 10 };
const req = (over: Partial<GenerateRequest> = {}): GenerateRequest => ({
  prompt: "", era: "newsstand", pages: 0, artist: "openai/gpt-image-1", uploads: [photo], links: [], ...over,
});

test("one photo and nothing else is a single", () => {
  expect(isSingle(req())).toBe(true);
  expect(isSingle(req({ title: "Me" }))).toBe(true);
});

test("anything more makes a full comic", () => {
  expect(isSingle(req({ prompt: "a heist" }))).toBe(false);
  expect(isSingle(req({ uploads: [photo, photo] }))).toBe(false);
  expect(isSingle(req({ uploads: [{ ...photo, mime: "video/mp4" }] }))).toBe(false);
  expect(isSingle(req({ links: ["https://example.com"] }))).toBe(false);
  expect(isSingle(req({ pages: 4 }))).toBe(false);
});

test("a single has no interior pages", () => {
  expect(pageRange(0, null, true)).toEqual({ min: 0, max: 0 });
});

test("new pages go in before the back cover, numbered on", () => {
  const single: ComicPage[] = [
    { id: "cover", kind: "cover", status: "ready" },
    { id: "back", kind: "back", status: "ready" },
  ];
  expect(appendPages(single, ["a", "b"]).map((p) => p.id)).toEqual(["cover", "page-01", "page-02", "back"]);
  const book = appendPages(single, ["a", "b"]);
  const more = appendPages(book, ["c"]);
  expect(more.map((p) => p.id)).toEqual(["cover", "page-01", "page-02", "page-03", "back"]);
  expect(more[3]).toMatchObject({ status: "pending", caption: "c", kind: "page" });
});

test("a continuation keeps the comic's own story", () => {
  const script = { title: "CAT PATROL", logline: "A lighthouse cat keeps watch.", cover: { concept: "a cat on a rail", blurb: "" }, pages: [] } as unknown as ComicScript;
  const text = continuationRequest(script, "she meets a gull", []);
  expect(text).toContain("CAT PATROL");
  expect(text).toContain("she meets a gull");
});
