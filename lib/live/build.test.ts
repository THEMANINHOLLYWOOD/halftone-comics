import { expect, test } from "vitest";
import { buildStage } from "./build";

test("each pipeline line maps to a studio step and a hero at work", () => {
  expect(buildStage("Reading what you dropped in…", 0, 4)).toMatchObject({ step: 0, hero: "hex" });
  expect(buildStage("Writing the script…", 0, 4)).toMatchObject({ step: 0, hero: "hex" });
  expect(buildStage("Drawing the cover…", 0, 4)).toMatchObject({ step: 1, hero: "volt" });
  expect(buildStage("Inking the pages… 1 of 4 done", 1, 4)).toMatchObject({ step: 2 });
  expect(buildStage("Painting the poster…", 4, 4)).toMatchObject({ step: 4, hero: "bloom" });
});

test("the line names the hero and what they are doing", () => {
  expect(buildStage("Drawing the cover…", 0, 4).line).toBe("Volt is pencilling the cover");
  expect(buildStage("Inking the pages… 2 of 4 done", 2, 4).line).toMatch(/page 3/);
  expect(buildStage(undefined, 0, 4).line.length).toBeGreaterThan(0);
});
