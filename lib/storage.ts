// Where comics live. Two drivers behind one interface:
//
//   blob   Vercel Blob, a private store, used whenever Blob credentials are
//          present, i.e. on Vercel or after `vercel env pull`.
//   local  plain files under ./library, for development without Blob.
//
// Paths look the same in both: "comics/<id>/comic.json", "uploads/<file>".
// The store is private on purpose: only private reads can skip the CDN
// cache, and records that change while a comic is drawn must be read fresh.
// Sheets reach browsers through /api/files, which the CDN caches for good.

import { del, get, put } from "@vercel/blob";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebStream } from "node:stream/web";

export const LIBRARY_DIR = process.env.COMIC_LIBRARY_DIR
  ? path.resolve(process.env.COMIC_LIBRARY_DIR)
  : path.join(process.cwd(), "library");

export type StorageKind = "blob" | "local";

export function storageKind(): StorageKind {
  return process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID ? "blob" : "local";
}

/** Thrown by `writeJson` when `ifMatch` no longer matches: someone else wrote first. */
export class WriteConflictError extends Error {}

const SAFE_PATH = /^[a-z0-9][a-z0-9._/-]{0,300}$/i;

function check(p: string): string {
  if (!SAFE_PATH.test(p) || p.includes("..") || p.includes("//")) throw new Error(`Bad storage path: ${p}`);
  return p;
}

function localPath(p: string): string {
  return path.join(LIBRARY_DIR, ...check(p).split("/"));
}

/** URL the browser can load a stored sheet from (see app/api/files). */
export function fileUrl(p: string): string {
  return `/api/files/${check(p)}`;
}

const ACCESS = "private" as const;

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

// ---- JSON ----------------------------------------------------------------

export interface JsonRead<T> {
  data: T;
  /** Pass back to `writeJson` to only write if nobody changed it since. */
  etag: string;
}

export async function readJson<T>(p: string): Promise<JsonRead<T> | null> {
  if (storageKind() === "local") {
    try {
      const raw = await readFile(localPath(p), "utf8");
      return { data: JSON.parse(raw) as T, etag: String(raw.length) + raw.slice(-32) };
    } catch {
      return null;
    }
  }
  // Records change while a comic is drawn, so always read past the CDN.
  const result = await get(check(p), { access: ACCESS, useCache: false });
  if (!result || result.statusCode !== 200) return null;
  const raw = (await streamToBuffer(result.stream)).toString("utf8");
  return { data: JSON.parse(raw) as T, etag: result.blob.etag };
}

export async function writeJson(p: string, data: unknown, options: { ifMatch?: string } = {}): Promise<void> {
  const body = JSON.stringify(data, null, 2);
  if (storageKind() === "local") {
    const target = localPath(p);
    if (options.ifMatch) {
      const current = await readJson(p);
      if (current && current.etag !== options.ifMatch) throw new WriteConflictError(p);
    }
    await mkdir(path.dirname(target), { recursive: true });
    // Write-then-rename so a reader never sees half a file.
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, body);
    await rename(tmp, target);
    return;
  }
  try {
    await put(check(p), body, {
      access: ACCESS,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      // Shortest the CDN allows; reads that must be fresh bypass it anyway.
      cacheControlMaxAge: 60,
      ...(options.ifMatch ? { ifMatch: options.ifMatch } : {}),
    });
  } catch (error) {
    if ((error as Error)?.name === "BlobPreconditionFailedError") throw new WriteConflictError(p);
    throw error;
  }
}

// ---- files ---------------------------------------------------------------

/** Store a file and return the URL a browser can load it from. Paths are written once. */
export async function writeBytes(p: string, data: Buffer, contentType: string): Promise<string> {
  if (storageKind() === "local") {
    const target = localPath(p);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
    return fileUrl(p);
  }
  await put(check(p), data, {
    access: ACCESS,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
    // Every redraw gets a new path, so a stored sheet never changes.
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  return fileUrl(p);
}

export async function readBytes(p: string): Promise<Buffer | null> {
  if (storageKind() === "local") {
    try {
      return await readFile(localPath(p));
    } catch {
      return null;
    }
  }
  const result = await get(check(p), { access: ACCESS });
  if (!result || result.statusCode !== 200) return null;
  return streamToBuffer(result.stream);
}

export async function removePaths(paths: string[]): Promise<void> {
  if (!paths.length) return;
  if (storageKind() === "local") {
    await Promise.all(paths.map((p) => rm(localPath(p), { recursive: true, force: true })));
    return;
  }
  // `del` takes URLs or pathnames; batch to keep requests small.
  for (let i = 0; i < paths.length; i += 100) {
    await del(paths.slice(i, i + 100).map(check)).catch(() => undefined);
  }
}

// ---- uploads -------------------------------------------------------------

const BLOB_HOST = /\.(public|private)\.blob\.vercel-storage\.com$/;
const LOCAL_UPLOAD = /^uploads\/[a-f0-9-]{36}$/;

/**
 * Uploads are referred to by their Blob URL (on Vercel) or their storage
 * path (locally). Only files that went through our own upload flow qualify.
 */
export function isUploadRef(ref: string): boolean {
  if (storageKind() === "local") return LOCAL_UPLOAD.test(ref);
  try {
    const url = new URL(ref);
    return url.protocol === "https:" && BLOB_HOST.test(url.hostname) && url.pathname.startsWith("/uploads/");
  } catch {
    return false;
  }
}

export function uploadPath(ref: string): string {
  if (storageKind() === "local") return `${ref}/file`;
  return decodeURIComponent(new URL(ref).pathname.slice(1));
}

/** Copy an upload (or any stored file) to a temp file, streaming, and return its path. */
export async function downloadToTemp(ref: string, name: string): Promise<string> {
  const dir = path.join(os.tmpdir(), "comic-work");
  await mkdir(dir, { recursive: true });
  const ext = name.includes(".") ? `.${name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")}` : "";
  const target = path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);

  if (storageKind() === "local" && !/^https?:/.test(ref)) {
    const source = LOCAL_UPLOAD.test(ref) ? localPath(`${ref}/file`) : localPath(ref);
    await pipeline((await import("node:fs")).createReadStream(source), createWriteStream(target));
    return target;
  }
  const result = await get(ref, { access: ACCESS });
  if (!result || result.statusCode !== 200) throw new Error(`Could not read ${name} back from storage.`);
  await pipeline(Readable.fromWeb(result.stream as unknown as WebStream<Uint8Array>), createWriteStream(target));
  return target;
}
