// The library: the classics that ship with the site, plus every comic made
// here, kept in storage (see ./storage.ts) as
//
//   comics/index.json            ids of every comic made here
//   comics/<id>/comic.json       its public record
//   comics/<id>/<page>.r<n>.*    each sheet, at a few sizes (served by /api/files)
//   private/<key>/...            job record and reference stills (see ./auth.ts)
//   trash/<id>-<time>.json       records of removed comics

import sharp from "sharp";
import { privateFolder } from "./auth";
import {
  readJson,
  removePaths,
  writeBytes,
  writeJson,
  WriteConflictError,
} from "./storage";
import { COMIC_ID } from "./share";
import type { Comic, ComicPage, PageUrls } from "./types";

const ID_RE = COMIC_ID;
const INDEX = "comics/index.json";

export class NotFoundError extends Error {}

export function assertId(id: string): string {
  if (!ID_RE.test(id)) throw new NotFoundError(`Unknown comic: ${id}`);
  return id;
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "comic"
  );
}

/** Ids of the old built-in classics, which are no longer part of the site. */
export function isClassic(id: string): boolean {
  return id.startsWith("classic-");
}

// ---- index -----------------------------------------------------------------

interface IndexEntry {
  id: string;
  createdAt: string;
}

async function readIndex() {
  return (await readJson<IndexEntry[]>(INDEX)) ?? { data: [] as IndexEntry[], etag: "" };
}

/** Read-modify-write the index; retried if another request wrote it first. */
async function changeIndex(change: (entries: IndexEntry[]) => IndexEntry[]): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await readIndex();
    try {
      await writeJson(INDEX, change(current.data), current.etag ? { ifMatch: current.etag } : {});
      shelfMemo = null;
      return;
    } catch (error) {
      if (!(error instanceof WriteConflictError)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  throw new Error("The library is busy. Try again in a moment.");
}

// ---- comics ----------------------------------------------------------------

const manifestPath = (id: string) => `comics/${assertId(id)}/comic.json`;

async function readStored(id: string): Promise<Comic | null> {
  return (await readJson<Comic>(manifestPath(id)))?.data ?? null;
}

// Every shelf visit would otherwise read every manifest; a few seconds of
// reuse within one server instance keeps that cheap without going stale.
let shelfMemo: { at: number; comics: Comic[] } | null = null;
const SHELF_MEMO_MS = 4000;

/** Every comic, newest first. */
export async function listComics(): Promise<Comic[]> {
  if (shelfMemo && Date.now() - shelfMemo.at < SHELF_MEMO_MS) return shelfMemo.comics;
  const { data } = await readIndex();
  const made = (await Promise.all(data.map((entry) => readStored(entry.id)))).filter(
    (c): c is Comic => c !== null,
  );
  made.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const comics = made;
  shelfMemo = { at: Date.now(), comics };
  return comics;
}

export async function getComic(id: string): Promise<Comic> {
  const comic = await readStored(assertId(id));
  if (!comic) throw new NotFoundError(`Unknown comic: ${id}`);
  return comic;
}

export async function createComic(comic: Comic): Promise<Comic> {
  await writeJson(manifestPath(comic.id), comic);
  await changeIndex((entries) => [
    { id: comic.id, createdAt: comic.createdAt },
    ...entries.filter((e) => e.id !== comic.id),
  ]);
  return comic;
}

// Sheets finish drawing in parallel, so edits to one comic's record are
// queued behind each other instead of racing on read-modify-write. Only one
// background run works on a comic at a time, so one process is the writer.
const queues = new Map<string, Promise<unknown>>();

export function updateComic(id: string, change: (comic: Comic) => void): Promise<Comic> {
  const run = async () => {
    const comic = await readStored(id);
    if (!comic) throw new NotFoundError(`Unknown comic: ${id}`);
    change(comic);
    await writeJson(manifestPath(id), comic);
    shelfMemo = null;
    return comic;
  };
  const next = (queues.get(id) ?? Promise.resolve()).then(run, run);
  queues.set(
    id,
    next.catch(() => undefined),
  );
  return next;
}

/**
 * Removing keeps a copy of the record in trash/ (and leaves the sheets in
 * place), so a comic removed by mistake can be put back by hand.
 */
export async function trashComic(id: string): Promise<void> {
  const comic = await readStored(assertId(id));
  if (!comic) throw new NotFoundError(`Unknown comic: ${id}`);
  await writeJson(`trash/${id}-${Date.now()}.json`, comic);
  await changeIndex((entries) => entries.filter((e) => e.id !== id));
  await removePaths([manifestPath(id)]);
}

export async function uniqueComicId(title: string): Promise<string> {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  // A random tail means a removed comic's paths are never reused by a new one.
  const tail = Math.random().toString(36).slice(2, 6);
  const base = `${stamp}-${slugify(title).slice(0, 34)}-${tail}`;
  const { data } = await readIndex();
  const taken = new Set(data.map((e) => e.id));
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  return id;
}

export async function nextIssueNumber(): Promise<number> {
  return (await readIndex()).data.length + 1;
}

// ---- sheets ----------------------------------------------------------------

/**
 * Store a freshly drawn sheet at every size the studio uses. Each revision
 * gets its own file names, so a URL never changes what it shows.
 */
export async function saveSheet(id: string, page: ComicPage, rev: number, data: Buffer, mime: string): Promise<PageUrls> {
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const base = `comics/${assertId(id)}/${page.id}.r${rev}`;
  const sized = (width: number) =>
    sharp(data)
      .resize({ width, withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: width >= 1280 ? 88 : 84 })
      .toBuffer();
  const [w1280, w640, w320] = await Promise.all([sized(1280), sized(640), sized(320)]);
  const [full, u1280, u640, u320] = await Promise.all([
    writeBytes(`${base}.${ext}`, data, mime),
    writeBytes(`${base}.w1280.jpg`, w1280, "image/jpeg"),
    writeBytes(`${base}.w640.jpg`, w640, "image/jpeg"),
    writeBytes(`${base}.w320.jpg`, w320, "image/jpeg"),
  ]);
  return { full, w1280: u1280, w640: u640, w320: u320 };
}

/** The share image: cropped to the 1200×630 card every link preview uses. */
export async function saveShareImage(id: string, rev: number, data: Buffer): Promise<string> {
  const card = await sharp(data)
    .resize(1200, 630, { fit: "cover", position: "attention" })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 84 })
    .toBuffer();
  return writeBytes(`comics/${assertId(id)}/share.r${rev}.jpg`, card, "image/jpeg");
}

export function shareFile(id: string, rev: number): string {
  return `comics/${assertId(id)}/share.r${rev}.jpg`;
}

/** Files of an earlier revision, to clear out after a redraw. */
export function sheetFiles(id: string, pageId: string, rev: number): string[] {
  const base = `comics/${assertId(id)}/${pageId}.r${rev}`;
  return [`${base}.png`, `${base}.jpg`, `${base}.webp`, `${base}.w1280.jpg`, `${base}.w640.jpg`, `${base}.w320.jpg`];
}

export function privatePath(id: string, file: string): string {
  return `${privateFolder(assertId(id))}/${file}`;
}
