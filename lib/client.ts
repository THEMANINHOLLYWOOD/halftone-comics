// Browser-side helpers: sheet URLs, how comics map onto the stage, and calls
// to the studio's API (with the passcode attached when one is set).

import { getEra } from "./eras";
import type { StageFace, StageSheet } from "./stage/types";
import type { Comic, ComicPage } from "./types";

export type SheetWidth = 320 | 640 | 1280;

export function pageUrl(page: ComicPage, width: SheetWidth): string | undefined {
  if (!page.urls) return undefined;
  return width === 320 ? page.urls.w320 : width === 640 ? page.urls.w640 : page.urls.w1280;
}

/** A link that saves the sheet as drawn instead of opening it. */
export function downloadUrl(comic: Comic, page: ComicPage): string | undefined {
  const full = page.urls?.full;
  if (!full) return undefined;
  if (full.startsWith("http")) return `${full}${full.includes("?") ? "&" : "?"}download=1`;
  if (full.startsWith("/api/files/")) return `${full}?download=${encodeURIComponent(`${comic.title} - ${pageLabel(comic, page)}`)}`;
  return full;
}

export function pageLabel(comic: Comic, page: ComicPage | undefined): string {
  if (!page) return "Back";
  if (page.kind === "cover") return "Cover";
  if (page.kind === "back") return "Back cover";
  const total = comic.pages.filter((p) => p.kind === "page").length;
  return `Page ${Number(page.id.split("-")[1])} of ${total}`;
}

function face(comic: Comic, page: ComicPage, width: SheetWidth): StageFace {
  const src = page.status === "ready" ? pageUrl(page, width) : undefined;
  if (src) return { state: "ready", src };
  if (page.status === "failed") return { state: "failed", note: page.error };
  const what = page.kind === "page" ? `Page ${Number(page.id.split("-")[1])}` : pageLabel(comic, page);
  return { state: "pending", note: `${what} · pencils` };
}

function typesetBack(comic: Comic, subtitle?: string): StageFace {
  const era = getEra(comic.era);
  const line =
    subtitle ?? `${era.name} · No. ${comic.issue ?? 1}`;
  return { state: "blank", title: comic.title, subtitle: line };
}

/** The shelf: one closed comic each, cover on the front, back cover behind it. */
export function shelfSheets(comics: Comic[], width: SheetWidth, sealed: (comic: Comic) => boolean = () => false): StageSheet[] {
  return comics.map((comic) => {
    const story = comic.pages.filter((p) => p.kind === "page").length;
    const cover = comic.pages.find((p) => p.kind === "cover") ?? comic.pages[0];
    const back = comic.pages.find((p) => p.kind === "back");
    return {
      key: comic.id,
      front: cover ? face(comic, cover, width) : typesetBack(comic),
      back: back ? face(comic, back, width) : typesetBack(comic),
      // A single is a slim card-stock comic; every leaf of a book adds to it.
      thickness: story === 0 ? 0 : Math.min(1, 0.3 + story * 0.07),
      sealed: sealed(comic),
    };
  });
}

/**
 * Reading a comic: its pages become leaves, two faces each, the way the book
 * is bound. Turning a sheet over shows the next page.
 */
export function leafSheets(comic: Comic, width: SheetWidth): StageSheet[] {
  const leaves: StageSheet[] = [];
  for (let i = 0; i < comic.pages.length; i += 2) {
    const front = comic.pages[i];
    const back = comic.pages[i + 1];
    leaves.push({
      // The first leaf shares the shelf sheet's key, so opening a comic keeps
      // its cover in place instead of swapping it out.
      key: i === 0 ? comic.id : `${comic.id}:${i / 2}`,
      front: face(comic, front, width),
      back: back ? face(comic, back, width) : typesetBack(comic, i === 0 ? undefined : "The end"),
    });
  }
  return leaves;
}

// ---- API ---------------------------------------------------------------------

const PASSCODE_KEY = "comic-studio-passcode";

export function getPasscode(): string {
  try {
    return localStorage.getItem(PASSCODE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setPasscode(value: string): void {
  try {
    if (value) localStorage.setItem(PASSCODE_KEY, value);
    else localStorage.removeItem(PASSCODE_KEY);
  } catch {
    // Private browsing: it just will not be remembered.
  }
}

/** The server turned the request down for want of the right passcode. */
export class PasscodeError extends Error {}

export async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const passcode = getPasscode();
  if (passcode) headers.set("x-studio-passcode", passcode);
  // The admin's session, when signed in (only it unlocks choosing models).
  const token = (await import("./session")).accessToken();
  if (token && !headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
  const res = await fetch(url, { ...init, headers });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; passcode?: boolean };
  if (res.status === 401 && body.passcode) {
    setPasscode("");
    throw new PasscodeError(body.error ?? "That studio passcode is not right.");
  }
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
