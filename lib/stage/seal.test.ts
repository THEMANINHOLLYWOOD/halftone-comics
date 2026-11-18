import { expect, test } from "vitest";
import { sealPose } from "./seal";

test("seal timeline order and bounds", () => {
  expect(sealPose(0)).toEqual({ tape: 0, flap: 0, slide: 0, bagFade: 0 });
  expect(sealPose(1)).toEqual({ tape: 1, flap: 1, slide: 1, bagFade: 1 });
  const mid = sealPose(0.4);
  expect(mid.tape).toBe(1);
  expect(mid.flap).toBeGreaterThan(0);
  expect(mid.slide).toBe(0);
  for (const p of [-1, 2]) for (const v of Object.values(sealPose(p))) {
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  }
});
