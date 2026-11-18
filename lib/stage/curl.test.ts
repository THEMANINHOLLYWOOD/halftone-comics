import { expect, test } from "vitest";
import { clampPose, leafPoint, tipAngleFor } from "./curl";

test("flat on the right and on the left", () => {
  expect(leafPoint(1, 0, 0)).toMatchObject({ x: 1, z: 0 });
  const left = leafPoint(1, Math.PI, Math.PI);
  expect(left.x).toBeCloseTo(-1);
  expect(left.z).toBeCloseTo(0);
});

test("arc length is preserved while curled", () => {
  let length = 0;
  let prev = leafPoint(0, 0.6, 2.1);
  for (let i = 1; i <= 200; i++) {
    const p = leafPoint(i / 200, 0.6, 2.1);
    length += Math.hypot(p.x - prev.x, p.z - prev.z);
    prev = p;
  }
  expect(length).toBeCloseTo(1, 2);
});

test("a turning leaf never dips below the stack", () => {
  for (let u = 0; u <= 1; u += 0.05) expect(leafPoint(u, 0.3, 2.8).z).toBeGreaterThanOrEqual(0);
});

test("normals face up on a flat right page and are unit length", () => {
  const p = leafPoint(0.5, 0, 0);
  expect(p.nz).toBeCloseTo(1);
  const q = leafPoint(0.7, 0.8, 2.2);
  expect(Math.hypot(q.nx, q.nz)).toBeCloseTo(1);
});

test("tipAngleFor maps the pointer to the edge", () => {
  expect(tipAngleFor(1)).toBeCloseTo(0);
  expect(tipAngleFor(0)).toBeCloseTo(Math.PI / 2);
  expect(tipAngleFor(-2)).toBeCloseTo(Math.PI);
});

test("clampPose keeps every angle on the page's side of the spine", () => {
  expect(clampPose(-0.5, 4)).toEqual({ a: 0, t: Math.PI });
});
