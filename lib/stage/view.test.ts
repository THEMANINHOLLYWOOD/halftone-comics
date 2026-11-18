import { expect, test } from "vitest";
import { bookFrame, normalise, stepBook } from "./view";

test("single layout: right page, then the left page behind it", () => {
  expect(bookFrame(3, { index: 0, face: 0 }, "single")).toEqual({ turned: 0, cameraX: 0.5 });
  expect(bookFrame(3, { index: 0, face: 1 }, "single")).toEqual({ turned: 1, cameraX: -0.5 });
  expect(bookFrame(3, { index: 1, face: 0 }, "single")).toEqual({ turned: 1, cameraX: 0.5 });
});

test("spread layout: closed front, open spreads, closed back", () => {
  expect(bookFrame(3, { index: 0, face: 0 }, "spread")).toEqual({ turned: 0, cameraX: 0.5 });
  expect(bookFrame(3, { index: 0, face: 1 }, "spread")).toEqual({ turned: 1, cameraX: 0 });
  expect(bookFrame(3, { index: 2, face: 1 }, "spread")).toEqual({ turned: 3, cameraX: -0.5 });
});

test("spread steps skip the duplicate view and stop at the ends", () => {
  expect(stepBook(3, { index: 0, face: 0 }, 1, "spread")).toEqual({ index: 0, face: 1 });
  expect(stepBook(3, { index: 0, face: 1 }, 1, "spread")).toEqual({ index: 1, face: 1 });
  expect(stepBook(3, { index: 2, face: 1 }, 1, "spread")).toBeNull();
  expect(stepBook(3, { index: 1, face: 1 }, -1, "spread")).toEqual({ index: 0, face: 1 });
  expect(stepBook(3, { index: 0, face: 1 }, -1, "spread")).toEqual({ index: 0, face: 0 });
  expect(stepBook(3, { index: 0, face: 0 }, -1, "spread")).toBeNull();
});

test("single steps visit every page", () => {
  expect(stepBook(2, { index: 0, face: 0 }, 1, "single")).toEqual({ index: 0, face: 1 });
  expect(stepBook(2, { index: 0, face: 1 }, 1, "single")).toEqual({ index: 1, face: 0 });
  expect(stepBook(2, { index: 1, face: 1 }, 1, "single")).toBeNull();
  expect(stepBook(2, { index: 1, face: 0 }, -1, "single")).toEqual({ index: 0, face: 1 });
});

test("rotating the phone keeps the same page in view", () => {
  const pos = normalise(3, { index: 1, face: 0 }, "spread");
  expect(pos).toEqual({ index: 0, face: 1 });
  expect(bookFrame(3, pos, "spread").turned).toBe(1);
});

test("out-of-range positions are clamped", () => {
  expect(normalise(1, { index: 5, face: 1 }, "single")).toEqual({ index: 0, face: 1 });
  expect(normalise(0, { index: 2, face: 1 }, "single")).toEqual({ index: 0, face: 0 });
});
