import { expect, test } from "vitest";
import { DEFAULT_ARTIST } from "./artists";
import { getEra } from "./eras";
import { shareArtist } from "./pipeline";
import { backPrompt, sharePrompt } from "./prompts";
import type { Comic, ComicScript } from "./types";

function script(over: Partial<ComicScript> = {}): ComicScript {
  return {
    title: "CAT PATROL",
    tagline: "Nine lives, one beat",
    logline: "A lighthouse cat keeps the harbour safe.",
    setting: "A windy harbour town",
    characters: [{ name: "Mitts", look: "a grey tabby in a yellow raincoat" }],
    cover: { concept: "Mitts on the lighthouse rail, lamp blazing behind her", blurb: "" },
    pages: [],
    back: { concept: "The harbour at dawn" },
    ...over,
  };
}

function comic(over: Partial<Comic> = {}): Comic {
  return { id: "x", title: "CAT PATROL", era: "newsstand", collection: "new", createdAt: "", status: "ready", pages: [], ...over };
}

test("sharePrompt asks for a wide promo with the title lettered", () => {
  const p = sharePrompt(script(), getEra("newsstand"), 3);
  expect(p).toMatch(/landscape/i);
  expect(p).toContain('"CAT PATROL"');
});

test("shareArtist keeps an artist this server can reach directly, else the default", () => {
  expect(shareArtist(comic({ artist: DEFAULT_ARTIST }), { openai: true, gemini: false })).toBe(DEFAULT_ARTIST);
  expect(shareArtist(comic({ artist: "google/gemini-x" }), { openai: true, gemini: false })).toBe(DEFAULT_ARTIST);
  expect(shareArtist(comic({ artist: "google/gemini-x" }), { openai: true, gemini: true })).toBe("google/gemini-x");
});

test("the back cover is the back of the front cover's scene", () => {
  const p = backPrompt(script(), getEra("newsstand"), "");
  expect(p).toMatch(/same moment as the front cover/i);
  expect(p).toMatch(/from behind|opposite side/i);
});
