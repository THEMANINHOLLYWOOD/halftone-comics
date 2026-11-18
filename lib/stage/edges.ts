// The edges of a closed comic: a thin band round the sheet, from the front
// cover (z 0) to the back cover (z 1). The stage bends it with the covers, so
// picking a comic up never shows a stiff board between them.

/** Which side of the comic a point is on. */
export const EDGE = { fore: 0, head: 1, spine: 2, tail: 3 } as const;

export interface EdgeBand {
  /** x, y on the sheet's outline; z is 0 at the front cover, 1 at the back. */
  positions: number[];
  /** Unit vector pointing out of the sheet, per point. */
  outward: number[];
  /** u along the side (bottom to top, or spine to fore-edge), v through the thickness. */
  uvs: number[];
  sides: number[];
  indices: number[];
}

/** A band round a w × h sheet, split like the sheet's own grid so it bends as smoothly. */
export function edgeBand(w: number, h: number, segX: number, segY: number): EdgeBand {
  const band: EdgeBand = { positions: [], outward: [], uvs: [], sides: [], indices: [] };
  const side = (id: number, n: number, ox: number, oy: number, at: (u: number) => [number, number]) => {
    const first = band.positions.length / 3;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const [x, y] = at(u);
      for (const z of [0, 1]) {
        band.positions.push(x, y, z);
        band.outward.push(ox, oy);
        band.uvs.push(u, z);
        band.sides.push(id);
      }
    }
    for (let i = 0; i < n; i++) {
      const a = first + i * 2;
      band.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  };
  side(EDGE.fore, segY, 1, 0, (u) => [w / 2, (u - 0.5) * h]);
  side(EDGE.head, segX, 0, 1, (u) => [(u - 0.5) * w, h / 2]);
  side(EDGE.spine, segY, -1, 0, (u) => [-w / 2, (u - 0.5) * h]);
  side(EDGE.tail, segX, 0, -1, (u) => [(u - 0.5) * w, -h / 2]);
  return band;
}
