// Faces that have no art yet (or never will) are drawn on a canvas so the
// sheet still reads as a piece of paper: a pencilled layout while a page is
// being inked, a typeset back cover for the
// comics that have none.

import { BRAND } from "../brand";
import type { StageFace } from "./types";

export interface PaperFonts {
  display: string;
  mono: string;
}

const W = 800;
const H = 1200;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number) {
  // Canvas letter-spacing is not available everywhere, so place glyphs by hand.
  let cursor = x;
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + tracking;
  }
}

function drawPencils(ctx: CanvasRenderingContext2D, face: StageFace, fonts: PaperFonts) {
  const seed = hash(face.note ?? face.title ?? "page");
  const blue = "rgba(118, 170, 214, 0.55)";
  ctx.strokeStyle = blue;
  ctx.lineWidth = 2;
  ctx.setLineDash([]);

  // A loose three-tier layout, varied per page so a stack of pending sheets
  // does not look stamped.
  const margin = 70;
  const gutter = 22;
  const tiers = [1 + (seed % 2), 1 + ((seed >> 3) % 3), 1 + ((seed >> 6) % 2)];
  const tierH = (H - margin * 2 - 110 - gutter * 2) / 3;
  tiers.forEach((count, row) => {
    const y = margin + row * (tierH + gutter);
    const w = (W - margin * 2 - gutter * (count - 1)) / count;
    for (let i = 0; i < count; i += 1) {
      const x = margin + i * (w + gutter);
      ctx.strokeRect(x, y, w, tierH);
      // Perspective guide lines, the way a penciller blocks a panel in.
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(x, y + tierH);
      ctx.lineTo(x + w, y);
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + tierH);
      ctx.stroke();
      ctx.restore();
    }
  });

  ctx.fillStyle = "rgba(70, 120, 170, 0.9)";
  ctx.font = `500 22px ${fonts.mono}`;
  ctx.textBaseline = "alphabetic";
  spaced(ctx, (face.note ?? "PENCILS").toUpperCase(), margin, H - margin - 10, 3);
}

function drawFailed(ctx: CanvasRenderingContext2D, face: StageFace, fonts: PaperFonts) {
  ctx.fillStyle = "#c2372c";
  ctx.font = `400 64px ${fonts.display}`;
  ctx.textBaseline = "alphabetic";
  let y = H / 2 - 40;
  for (const line of wrap(ctx, "THIS PAGE DIDN’T MAKE IT TO PRESS", W - 180)) {
    ctx.fillText(line, 90, y);
    y += 70;
  }
  ctx.fillStyle = "#6b6b68";
  ctx.font = `500 22px ${fonts.mono}`;
  for (const line of wrap(ctx, face.note ?? "Use Redraw to try it again.", W - 180)) {
    y += 34;
    ctx.fillText(line, 90, y);
  }
}

function drawBack(ctx: CanvasRenderingContext2D, face: StageFace, fonts: PaperFonts) {
  const ink = "#161616";
  const margin = 84;

  ctx.fillStyle = ink;
  ctx.font = `500 21px ${fonts.mono}`;
  ctx.textBaseline = "alphabetic";
  spaced(ctx, BRAND.imprint, margin, margin + 18, 5);
  ctx.fillRect(margin, margin + 40, W - margin * 2, 3);

  const title = (face.title ?? "").toUpperCase();
  let size = 132;
  let lines: string[] = [];
  // Shrink the masthead until the title fits in five lines.
  for (; size >= 56; size -= 8) {
    ctx.font = `400 ${size}px ${fonts.display}`;
    lines = wrap(ctx, title, W - margin * 2);
    if (lines.length <= 5) break;
  }
  let y = margin + 80 + size;
  for (const line of lines) {
    ctx.fillText(line, margin, y);
    y += size * 1.04;
  }

  if (face.subtitle) {
    ctx.font = `500 22px ${fonts.mono}`;
    ctx.fillStyle = "#5c5c58";
    spaced(ctx, face.subtitle.toUpperCase(), margin, y + 8, 3);
  }

  // A barcode box, seeded by the title so each book gets its own.
  const boxW = 190;
  const boxH = 120;
  const bx = margin;
  const by = H - margin - boxH;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(bx, by, boxW, boxH);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, by, boxW, boxH);
  ctx.fillStyle = ink;
  let seed = hash(title) || 1;
  let x = bx + 14;
  while (x < bx + boxW - 16) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const bar = 2 + (seed >>> 29);
    ctx.fillRect(x, by + 12, bar, boxH - 38);
    x += bar + 2 + ((seed >>> 26) & 3);
  }
  ctx.font = `500 15px ${fonts.mono}`;
  ctx.fillText(String(hash(title)).padStart(10, "0").slice(0, 10), bx + 14, by + boxH - 10);

  ctx.font = `500 19px ${fonts.mono}`;
  ctx.fillStyle = "#5c5c58";
  const site = BRAND.name.toUpperCase();
  const siteWidth = [...site].reduce((sum, ch) => sum + ctx.measureText(ch).width + 3, 0);
  spaced(ctx, site, W - margin - siteWidth, H - margin - 6, 3);
}

export function drawPaper(face: StageFace, fonts: PaperFonts): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = face.state === "blank" ? "#f4efe2" : "#fbfaf6";
  ctx.fillRect(0, 0, W, H);

  if (face.state === "pending") drawPencils(ctx, face, fonts);
  else if (face.state === "failed") drawFailed(ctx, face, fonts);
  else drawBack(ctx, face, fonts);
  return canvas;
}

export function paperKey(face: StageFace): string {
  return `${face.state}|${face.title ?? ""}|${face.subtitle ?? ""}|${face.note ?? ""}`;
}
