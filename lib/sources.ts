// Turns whatever was dropped into the studio (photos, videos, audio, PDFs,
// notes, links) into sources the script model can read, one item at a time,
// so the work can stop and pick up again in the next background step.

import { execFile } from "node:child_process";
import { lookup } from "node:dns/promises";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline as pump } from "node:stream/promises";
import { promisify } from "node:util";
import sharp from "sharp";
import { checkFile, uploadFile } from "./gemini";
import { privatePath } from "./library";
import { downloadToTemp, writeBytes } from "./storage";
import type { ComicSource, SourceKind, UploadRef } from "./types";
import { videoDuration } from "./video";

const run = promisify(execFile);

const LINK_DOWNLOAD_LIMIT = 400 * 1024 * 1024;
const TEXT_LIMIT = 40_000;

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  heic: "image/heic", heif: "image/heif", avif: "image/avif", bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff",
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/mov", webm: "video/webm", avi: "video/avi",
  mpg: "video/mpeg", mpeg: "video/mpeg", wmv: "video/wmv", "3gp": "video/3gpp", flv: "video/x-flv",
  mp3: "audio/mp3", wav: "audio/wav", m4a: "audio/aac", aac: "audio/aac", ogg: "audio/ogg", flac: "audio/flac", aiff: "audio/aiff",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  txt: "text/plain", md: "text/markdown", csv: "text/csv", json: "application/json",
  srt: "text/plain", vtt: "text/vtt", html: "text/html", rtf: "text/rtf",
};

const DOCUMENT_MIMES = new Set(
  Object.entries(EXT_MIME)
    .filter(([ext]) => ["pdf", "docx", "doc", "pptx", "ppt", "xlsx", "xls"].includes(ext))
    .map(([, mime]) => mime),
);

/** Work out what a file is from its name and the type the browser reported. */
export function classify(name: string, reported: string): { mime: string; kind: SourceKind } {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const generic = !reported || reported === "application/octet-stream";
  const mime = (generic ? EXT_MIME[ext] : reported.split(";")[0].trim()) || "application/octet-stream";

  let kind: SourceKind = "file";
  if (mime.startsWith("image/")) kind = "image";
  else if (mime.startsWith("video/")) kind = "video";
  else if (mime.startsWith("audio/")) kind = "audio";
  else if (DOCUMENT_MIMES.has(mime)) kind = "document";
  else if (mime.startsWith("text/") || mime === "application/json") kind = "text";
  // Gemini wants its own spelling for QuickTime.
  return { mime: mime === "video/quicktime" ? "video/mov" : mime, kind };
}

/** Any still image, as an upright JPEG no larger than `max` on its long side. */
export async function toJpeg(input: Buffer | string, max = 1536): Promise<Buffer> {
  const shrink = (source: Buffer | string) =>
    sharp(source, { failOn: "none" })
      .rotate()
      .resize({ width: max, height: max, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 88 })
      .toBuffer();
  try {
    return await shrink(input);
  } catch (error) {
    // iPhone HEIC photos are beyond the bundled decoder; macOS can convert them.
    if (process.platform !== "darwin") throw error;
    const dir = os.tmpdir();
    const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const src = typeof input === "string" ? input : path.join(dir, `comic-in-${stamp}`);
    const out = path.join(dir, `comic-out-${stamp}.jpg`);
    try {
      if (typeof input !== "string") await writeFile(src, input);
      await run("sips", ["-s", "format", "jpeg", src, "--out", out], { timeout: 30_000 });
      return await shrink(out);
    } finally {
      if (typeof input !== "string") await rm(src, { force: true });
      await rm(out, { force: true });
    }
  }
}

function looksLikeText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 4096);
  if (!sample.length) return false;
  let odd = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 9 || (byte > 13 && byte < 32)) odd += 1;
  }
  return odd / sample.length < 0.02;
}

const clip = (value: string, limit = TEXT_LIMIT) =>
  value.length > limit ? `${value.slice(0, limit)}\n[…cut for length]` : value;

// ---- links ----------------------------------------------------------------

function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
    );
  }
  const v6 = address.toLowerCase();
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || v6.startsWith("::ffff:");
}

/** Links are fetched by the server, so they must not reach into the local network. */
async function assertPublic(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http and https links work.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("That address is on a private network.");
    return;
  }
  const records = await lookup(host, { all: true });
  if (!records.length || records.some((r) => isPrivateAddress(r.address))) {
    throw new Error("That address is on a private network.");
  }
}

async function fetchPublic(link: string): Promise<Response> {
  let url = new URL(link);
  for (let hop = 0; hop < 6; hop += 1) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(25_000),
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; ComicSheets/1.0)",
        accept: "text/html,application/xhtml+xml,image/*,video/*,application/pdf,*/*;q=0.8",
      },
    });
    const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!next) return res;
    await res.body?.cancel();
    url = new URL(next, url);
  }
  throw new Error("Too many redirects.");
}

async function readCapped(res: Response, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  if (!res.body) return Buffer.alloc(0);
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > limit) throw new Error("That file is too large to fetch.");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function readHtml(html: string): { title: string; description: string; body: string; image: string } {
  const meta = (name: string) => {
    const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i"))?.[0];
    return decodeEntities(tag?.match(/content=["']([^"']*)["']/i)?.[1] ?? "");
  };
  const title = meta("og:title") || decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "");
  const body = decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
  return {
    title: title.trim(),
    description: meta("og:description") || meta("description"),
    body,
    image: meta("og:image") || meta("twitter:image"),
  };
}

function youtubeUrl(url: URL): string | null {
  const host = url.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be" && url.pathname.length > 1) return `https://www.youtube.com/watch?v=${url.pathname.slice(1)}`;
  if (host === "youtube.com") {
    const id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]+)/)?.[1];
    if (id) return `https://www.youtube.com/watch?v=${id}`;
  }
  return null;
}


// ---- ingest ---------------------------------------------------------------

export type JobSource =
  | { kind: "text"; text: string }
  /** A photo, kept in the comic's private folder. */
  | { kind: "image"; file: string; label: string }
  /** A file Gemini holds (or a YouTube link it can watch). */
  | { kind: "media"; type: "video" | "audio" | "document"; uri: string; mime?: string; label: string };

export type IngestItem = { type: "upload"; upload: UploadRef } | { type: "link"; url: string };

export interface IngestState {
  items: IngestItem[];
  /** Index of the next item to read. */
  cursor: number;
  /** A file Gemini is still processing; the cursor moves on once it is ready. */
  waiting?: { name: string; mime: string; type: "video" | "audio" | "document"; label: string; since: number };
  sources: JobSource[];
  /** What the comic says it was made from. */
  shown: ComicSource[];
  /** Things worth telling the script writer (and the user) about. */
  notes: string[];
  /** Gemini file names, deleted once the comic is done. */
  remoteFiles: string[];
  /** Uploaded videos, for pulling stills. */
  videos: { ref: string; name: string }[];
  seconds: number | null;
  photos: number;
}

export function newIngest(uploads: UploadRef[], links: string[]): IngestState {
  return {
    items: [
      ...uploads.map((upload): IngestItem => ({ type: "upload", upload })),
      ...links.map((url): IngestItem => ({ type: "link", url })),
    ],
    cursor: 0,
    sources: [],
    shown: [],
    notes: [],
    remoteFiles: [],
    videos: [],
    seconds: null,
    photos: 0,
  };
}

const MAX_PHOTOS = 6;
/** How long to wait on Gemini processing a file before giving up on it. */
const PROCESSING_LIMIT_MS = 15 * 60_000;

interface IngestContext {
  id: string;
  state: IngestState;
  deadline: number;
  progress(line: string): Promise<void>;
  save(): Promise<void>;
}

async function addPhoto(ctx: IngestContext, source: Buffer | string, label: string) {
  if (ctx.state.photos >= MAX_PHOTOS) {
    ctx.state.notes.push(`${label}: skipped, only the first ${MAX_PHOTOS} photos are used.`);
    return;
  }
  ctx.state.photos += 1;
  const file = privatePath(ctx.id, `refs/photo-${String(ctx.state.photos).padStart(2, "0")}.jpg`);
  await writeBytes(file, await toJpeg(source), "image/jpeg");
  ctx.state.sources.push({ kind: "image", file, label });
}

async function sendToGemini(
  ctx: IngestContext,
  filePath: string,
  mime: string,
  type: "video" | "audio" | "document",
  label: string,
) {
  await ctx.progress(type === "video" ? `Sending ${label} to Gemini…` : `Reading ${label}…`);
  const file = await uploadFile(filePath, mime);
  ctx.state.remoteFiles.push(file.name);
  ctx.state.waiting = { name: file.name, mime: file.mime, type, label, since: Date.now() };
}

async function readFileItem(ctx: IngestContext, filePath: string, name: string, reported: string, origin: "upload" | "link") {
  const { mime, kind } = classify(name, reported);
  if (kind === "image") {
    await addPhoto(ctx, filePath, name);
  } else if (kind === "video" || kind === "audio" || kind === "document") {
    if (kind === "video") {
      const seconds = await videoDuration(filePath);
      if (seconds) ctx.state.seconds = (ctx.state.seconds ?? 0) + seconds;
    }
    await sendToGemini(ctx, filePath, mime, kind, name);
  } else {
    const buffer = await readFile(filePath);
    if (kind !== "text" && !looksLikeText(buffer)) {
      ctx.state.notes.push(`${name}: not a format the studio can read, skipped.`);
      return;
    }
    ctx.state.sources.push({ kind: "text", text: `Text — ${name}:\n${clip(buffer.toString("utf8"))}` });
  }
  ctx.state.shown.push({ kind: origin === "upload" ? kind : "link", name });
}

async function readUploadItem(ctx: IngestContext, upload: UploadRef) {
  const { kind } = classify(upload.name, upload.mime);
  await ctx.progress(kind === "video" ? `Reading ${upload.name}…` : `Reading ${upload.name}…`);
  const temp = await downloadToTemp(upload.ref, upload.name);
  try {
    await readFileItem(ctx, temp, upload.name, upload.mime, "upload");
    if (kind === "video") ctx.state.videos.push({ ref: upload.ref, name: upload.name });
  } finally {
    await rm(temp, { force: true });
  }
}

async function readLinkItem(ctx: IngestContext, link: string) {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    ctx.state.notes.push(`${link}: not a valid link.`);
    return;
  }
  const label = url.hostname.replace(/^www\./, "") + (url.pathname.length > 1 ? url.pathname.slice(0, 40) : "");

  const youtube = youtubeUrl(url);
  if (youtube) {
    ctx.state.sources.push({ kind: "media", type: "video", uri: youtube, label: youtube });
    ctx.state.shown.push({ kind: "link", name: label, note: "YouTube video" });
    return;
  }

  try {
    await ctx.progress(`Reading ${label}…`);
    const res = await fetchPublic(link);
    if (!res.ok) throw new Error(`the site answered ${res.status}`);
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();

    if (type.includes("html") || type === "") {
      const page = readHtml((await readCapped(res, 5 * 1024 * 1024)).toString("utf8"));
      ctx.state.sources.push({
        kind: "text",
        text: `Web page — ${link}\nTitle: ${page.title}\nDescription: ${page.description}\n\n${clip(page.body, 20_000)}`,
      });
      if (page.image) {
        try {
          const picture = await fetchPublic(new URL(page.image, url).toString());
          if (picture.ok) await addPhoto(ctx, await readCapped(picture, 25 * 1024 * 1024), `lead image from ${label}`);
        } catch {
          // The page text is still useful without its picture.
        }
      }
      if (page.body.length < 200 && !page.image) {
        ctx.state.notes.push(`${label}: the page shared almost nothing. Upload the photo or video itself for a better comic.`);
      }
      ctx.state.shown.push({ kind: "link", name: label, note: page.title || undefined });
      return;
    }

    // The link points straight at a file: save it and read it like an upload.
    const dir = path.join(os.tmpdir(), "comic-work");
    await mkdir(dir, { recursive: true });
    const temp = path.join(dir, `link-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > LINK_DOWNLOAD_LIMIT) throw new Error("that file is too large to fetch");
    let size = 0;
    const guard = async function* (body: AsyncIterable<Uint8Array>) {
      for await (const chunk of body) {
        size += chunk.byteLength;
        if (size > LINK_DOWNLOAD_LIMIT) throw new Error("that file is too large to fetch");
        yield chunk;
      }
    };
    try {
      await pump(Readable.from(guard(res.body as unknown as AsyncIterable<Uint8Array>)), createWriteStream(temp));
      const name = decodeURIComponent(url.pathname.split("/").pop() || label);
      await readFileItem(ctx, temp, name, type, "link");
    } finally {
      await rm(temp, { force: true });
    }
  } catch (error) {
    ctx.state.notes.push(`${label}: could not be read (${(error as Error).message}).`);
  }
}

/** Wait for the file Gemini is processing. False if time ran out first. */
async function settleWaiting(ctx: IngestContext): Promise<boolean> {
  const waiting = ctx.state.waiting;
  if (!waiting) return true;
  await ctx.progress(waiting.type === "video" ? `Gemini is watching ${waiting.label}…` : `Gemini is reading ${waiting.label}…`);
  for (;;) {
    // A failed status check is not a failed file: keep asking.
    const file = await checkFile(waiting.name, waiting.mime).catch(() => null);
    if (!file) {
      if (Date.now() > ctx.deadline - 10_000) return false;
      await new Promise((resolve) => setTimeout(resolve, 4000));
      continue;
    }
    if (file.state === "ACTIVE" && file.uri) {
      ctx.state.sources.push({ kind: "media", type: waiting.type, uri: file.uri, mime: file.mime, label: waiting.label });
      break;
    }
    if (file.state === "FAILED" || Date.now() - waiting.since > PROCESSING_LIMIT_MS) {
      ctx.state.notes.push(`${waiting.label}: Gemini could not process this file (mp4 works best), so it was left out.`);
      break;
    }
    if (Date.now() > ctx.deadline - 10_000) return false;
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  ctx.state.waiting = undefined;
  ctx.state.cursor += 1;
  await ctx.save();
  return true;
}

/**
 * Read items until all are in or `deadline` is near. Returns true when every
 * item has been read; false means call again (in a new step) to carry on.
 */
export async function ingest(ctx: IngestContext): Promise<boolean> {
  const { state } = ctx;
  for (;;) {
    if (!(await settleWaiting(ctx))) return false;
    if (state.cursor >= state.items.length) return true;
    // Reading one item (downloading, handing a video to Gemini) can take a while.
    if (Date.now() > ctx.deadline - 90_000) return false;

    const item = state.items[state.cursor];
    try {
      if (item.type === "upload") await readUploadItem(ctx, item.upload);
      else await readLinkItem(ctx, item.url);
    } catch (error) {
      const name = item.type === "upload" ? item.upload.name : item.url;
      state.notes.push(`${name}: ${(error as Error).message}`);
      state.waiting = undefined;
    }
    // A file handed to Gemini keeps the cursor until it is processed.
    if (!state.waiting) state.cursor += 1;
    await ctx.save();
  }
}

