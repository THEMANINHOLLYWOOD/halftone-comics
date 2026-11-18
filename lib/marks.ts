// Marks someone draws on a page to point at what should change: freehand loops
// and single taps, in page fractions (0–1 across, 0–1 down).

export type Mark = [number, number][];

const MAX_MARKS = 12;
const MAX_POINTS = 240;

const clamp = (n: number) => Math.min(Math.max(n, 0), 1);

/** Marks from a request body, tidied: inside the page, a sane amount, junk dropped. */
export function cleanMarks(raw: unknown): Mark[] {
  if (!Array.isArray(raw)) return [];
  const marks: Mark[] = [];
  for (const entry of raw) {
    if (!Array.isArray(entry)) continue;
    const points = entry
      .filter((p): p is [number, number] => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      .map(([x, y]): [number, number] => [clamp(x), clamp(y)]);
    if (!points.length) continue;
    // Long loops are thinned evenly rather than cut short.
    const step = Math.ceil(points.length / MAX_POINTS);
    marks.push(step > 1 ? points.filter((_, i) => i % step === 0) : points);
    if (marks.length >= MAX_MARKS) break;
  }
  return marks;
}

/** An SVG of the marks in bright red, sized to the page, to lay over the page image. */
export function marksSvg(marks: Mark[], width: number, height: number): string {
  const stroke = Math.max(4, Math.round(width * 0.008));
  const shapes = marks.map((mark) => {
    if (mark.length < 3) {
      const [x, y] = mark[0];
      return `<circle cx="${(x * width).toFixed(1)}" cy="${(y * height).toFixed(1)}" r="${(width * 0.035).toFixed(1)}" fill="none" stroke="#ff1744" stroke-width="${stroke}"/>`;
    }
    const d = mark.map(([x, y], i) => `${i ? "L" : "M"}${(x * width).toFixed(1)} ${(y * height).toFixed(1)}`).join(" ");
    return `<path d="${d} Z" fill="rgba(255,23,68,0.10)" stroke="#ff1744" stroke-width="${stroke}" stroke-linejoin="round"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${shapes.join("")}</svg>`;
}
