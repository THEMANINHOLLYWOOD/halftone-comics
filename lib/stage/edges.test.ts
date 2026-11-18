import { expect, test } from "vitest";
import { EDGE, edgeBand } from "./edges";

const W = 1;
const H = 1.5;

test("the band runs all the way round the sheet, front cover to back cover", () => {
  const band = edgeBand(W, H, 4, 6);
  // Each side has its own row of points (hard corners), at the front and at the back.
  expect(band.positions.length / 3).toBe(2 * 2 * (4 + 1) + 2 * 2 * (6 + 1));
  // Two triangles per segment, all the way round.
  expect(band.indices.length).toBe(6 * (2 * 4 + 2 * 6));
  for (let i = 0; i < band.positions.length; i += 3) {
    const [x, y, z] = [band.positions[i], band.positions[i + 1], band.positions[i + 2]];
    // On the perimeter...
    const onSide = Math.abs(Math.abs(x) - W / 2) < 1e-9 || Math.abs(Math.abs(y) - H / 2) < 1e-9;
    expect(onSide).toBe(true);
    // ...at the front (0) or the back (1) of the thickness.
    expect([0, 1]).toContain(z);
  }
});

test("each side faces out, and knows which side it is", () => {
  const band = edgeBand(W, H, 2, 2);
  const seen = new Set<number>();
  for (let v = 0; v < band.positions.length / 3; v++) {
    const [x, y] = [band.positions[v * 3], band.positions[v * 3 + 1]];
    const [ox, oy] = [band.outward[v * 2], band.outward[v * 2 + 1]];
    expect(Math.hypot(ox, oy)).toBeCloseTo(1);
    // Outward points away from the middle of the sheet.
    expect(x * ox + y * oy).toBeGreaterThan(0);
    const side = band.sides[v];
    seen.add(side);
    if (side === EDGE.spine) expect(x).toBeCloseTo(-W / 2);
    if (side === EDGE.fore) expect(x).toBeCloseTo(W / 2);
    if (side === EDGE.head) expect(y).toBeCloseTo(H / 2);
    if (side === EDGE.tail) expect(y).toBeCloseTo(-H / 2);
  }
  expect(seen).toEqual(new Set([EDGE.fore, EDGE.head, EDGE.spine, EDGE.tail]));
});

test("uv runs along the side (u, bottom to top or spine to fore-edge) and through the thickness (v)", () => {
  const band = edgeBand(W, H, 3, 3);
  for (let v = 0; v < band.positions.length / 3; v++) {
    const [x, y, z] = [band.positions[v * 3], band.positions[v * 3 + 1], band.positions[v * 3 + 2]];
    const [u, t] = [band.uvs[v * 2], band.uvs[v * 2 + 1]];
    expect(t).toBe(z);
    const side = band.sides[v];
    const along = side === EDGE.fore || side === EDGE.spine ? y / H + 0.5 : x / W + 0.5;
    expect(u).toBeCloseTo(along);
  }
});
