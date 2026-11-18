// Moving through a bound book. A position is a leaf and the face showing, as
// everywhere else in the studio: (i, 0) is leaf i lying on the right, front up;
// (i, 1) is leaf i turned over onto the left. A wide screen shows two pages at
// once (a spread), so there (i, 1) and (i + 1, 0) are the same view; a narrow
// one shows a single page and visits every face.

export type BookLayout = "spread" | "single";

export interface BookPos {
  index: number;
  face: 0 | 1;
}

/** How many leaves are turned, and where the camera centres (0 is the spine). */
export function bookFrame(leaves: number, pos: BookPos, layout: BookLayout): { turned: number; cameraX: number } {
  const turned = Math.min(pos.face === 0 ? pos.index : pos.index + 1, Math.max(leaves, 0));
  if (turned === 0) return { turned, cameraX: 0.5 };
  if (turned >= leaves) return { turned, cameraX: -0.5 };
  if (layout === "spread") return { turned, cameraX: 0 };
  return { turned, cameraX: pos.face === 0 ? 0.5 : -0.5 };
}

export function normalise(leaves: number, pos: BookPos, layout: BookLayout): BookPos {
  if (leaves <= 0) return { index: 0, face: 0 };
  const index = Math.min(Math.max(pos.index, 0), leaves - 1);
  if (layout === "spread" && pos.face === 0 && index > 0) return { index: index - 1, face: 1 };
  return { index, face: pos.face };
}

/** The next or previous view, or null at either end of the book. */
export function stepBook(leaves: number, from: BookPos, dir: 1 | -1, layout: BookLayout): BookPos | null {
  if (leaves <= 0) return null;
  const pos = normalise(leaves, from, layout);
  if (layout === "spread") {
    if (dir === 1) {
      if (pos.face === 0) return { index: 0, face: 1 };
      return pos.index + 1 < leaves ? { index: pos.index + 1, face: 1 } : null;
    }
    if (pos.face === 0) return null;
    return pos.index > 0 ? { index: pos.index - 1, face: 1 } : { index: 0, face: 0 };
  }
  if (dir === 1) {
    if (pos.face === 0) return { index: pos.index, face: 1 };
    return pos.index + 1 < leaves ? { index: pos.index + 1, face: 0 } : null;
  }
  if (pos.face === 1) return { index: pos.index, face: 0 };
  return pos.index > 0 ? { index: pos.index - 1, face: 1 } : null;
}

/** Two pages side by side on wide screens, one at a time on narrow or tall ones. */
export function bookLayoutFor(width: number, height: number): BookLayout {
  return width >= 720 && width >= height * 0.9 ? "spread" : "single";
}
