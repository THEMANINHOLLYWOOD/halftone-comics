// Share links: every comic has its own address, a preview card for link
// unfurls, and a one-tap way to send it. Safe on both server and browser.

import { BRAND } from "./brand";
import type { Comic } from "./types";

export const COMIC_ID = /^[a-z0-9][a-z0-9-]{0,95}$/;

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://comics.inchipala.com").replace(/\/+$/, "");
}

export function comicPath(id: string): string {
  return `/c/${id}`;
}

/** The comic id in a `/c/<id>` path, or null for anything else. */
export function parseComicPath(pathname: string): string | null {
  const match = /^\/c\/([^/]+)\/?$/.exec(pathname);
  return match && COMIC_ID.test(match[1]) ? match[1] : null;
}

const absolute = (path: string) => (/^https?:\/\//.test(path) ? path : `${siteUrl()}${path}`);

/** What a link to this comic unfurls as. */
export function shareMeta(comic: Comic): { title: string; description: string; image: string } {
  const painted = comic.share?.status === "ready" && comic.share.url ? comic.share.url : null;
  return {
    title: comic.title,
    description: [comic.tagline, `A comic made on ${BRAND.name}. ${BRAND.tagline}`].filter(Boolean).join(" · "),
    image: absolute(painted ?? `/api/og/${comic.id}`),
  };
}

/** The system share sheet on phones, the clipboard elsewhere. */
export async function shareComic(comic: Pick<Comic, "id" | "title">): Promise<"shared" | "copied" | "cancelled"> {
  const url = `${window.location.origin}${comicPath(comic.id)}`;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  if (coarse && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: comic.title, text: `${comic.title} — a comic`, url });
      return "shared";
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return "cancelled";
      // Fall through to copying.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    // Older browsers: a hidden text box and the copy command.
    const box = document.createElement("textarea");
    box.value = url;
    box.setAttribute("readonly", "");
    box.style.position = "fixed";
    box.style.opacity = "0";
    document.body.appendChild(box);
    box.select();
    document.execCommand("copy");
    box.remove();
  }
  return "copied";
}
