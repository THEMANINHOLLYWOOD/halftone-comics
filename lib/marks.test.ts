import { expect, test } from "vitest";
import { cleanMarks, marksSvg } from "./marks";
import { editPrompt } from "./prompts";

test("cleanMarks keeps loops and taps inside the page and drops junk", () => {
  const marks = cleanMarks([
    [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]],
    [[0.5, 0.5]],
    "nope",
    [[2, 2], [-1, 0.5]],
    [],
  ]);
  expect(marks).toHaveLength(3);
  expect(marks[2]).toEqual([[1, 1], [0, 0.5]]);
});

test("cleanMarks caps how much it accepts", () => {
  const loop = Array.from({ length: 900 }, (_, i) => [i / 900, 0.5]);
  const marks = cleanMarks(Array.from({ length: 40 }, () => loop));
  expect(marks.length).toBeLessThanOrEqual(12);
  expect(marks[0].length).toBeLessThanOrEqual(240);
});

test("marksSvg draws loops as paths and taps as rings in page pixels", () => {
  const svg = marksSvg([[[0.1, 0.1], [0.5, 0.1], [0.5, 0.5]], [[0.25, 0.75]]], 1000, 1500);
  expect(svg).toContain("<path");
  expect(svg).toContain("M100.0 150.0");
  expect(svg).toContain("<circle");
  expect(svg).toContain('cx="250.0"');
});

test("an edit keeps the page and changes only what was asked", () => {
  const withMarks = editPrompt("BASE PAGE PROMPT", "make the sky stormy", true);
  expect(withMarks).toContain("make the sky stormy");
  expect(withMarks).toMatch(/keep everything else/i);
  expect(withMarks).toMatch(/red/i);
  expect(withMarks).toContain("BASE PAGE PROMPT");
  expect(editPrompt("BASE", "brighter", false)).not.toMatch(/red loops/i);
});
