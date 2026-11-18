// Turns the imported classic covers into the static files the site ships:
//   public/classics/<id>/full.jpg, w640.jpg, w320.jpg
//   lib/classics.json   (titles and order)
// Run after scripts/import-classics.mjs:
//
//   node scripts/build-classics.mjs

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "library", "originals", "classics");
const OUT = path.join(ROOT, "public", "classics");

const ids = (await readdir(SOURCE)).filter((name) => name.startsWith("classic-")).sort();
const list = [];

for (const id of ids) {
  const manifest = JSON.parse(await readFile(path.join(SOURCE, id, "comic.json"), "utf8"));
  const cover = path.join(SOURCE, id, "cover.png");
  await mkdir(path.join(OUT, id), { recursive: true });
  const sizes = [
    ["full.jpg", 1280, 90],
    ["w640.jpg", 640, 84],
    ["w320.jpg", 320, 80],
  ];
  for (const [file, width, quality] of sizes) {
    await sharp(cover)
      .resize({ width, withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality, mozjpeg: true })
      .toFile(path.join(OUT, id, file));
  }
  list.push({ id, title: manifest.title, issue: manifest.issue, order: manifest.order });
}

list.sort((a, b) => a.order - b.order);
await writeFile(path.join(ROOT, "lib", "classics.json"), `${JSON.stringify(list, null, 2)}\n`);
console.log(`classics: ${list.length} built into public/classics`);
