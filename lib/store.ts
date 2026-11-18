"use client";

// The library as the browser sees it: one shared snapshot. The full shelf is
// read on load and on window focus; while a comic is being drawn, only that
// comic is polled, which keeps storage reads low.

import { useSyncExternalStore } from "react";
import { api } from "./client";
import type { Comic, StudioInfo } from "./types";

export interface LibrarySnapshot {
  /** Null until the first load finishes. */
  comics: Comic[] | null;
  info: StudioInfo;
  error: string | null;
}

const EMPTY: LibrarySnapshot = {
  comics: null,
  info: { hasKey: true, hasFfmpeg: true, storage: "local", locked: false, keys: { openai: false, gemini: false } },
  error: null,
};
const POLL_MS = 2500;

let snapshot = EMPTY;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function publish(next: LibrarySnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (listeners.size && snapshot.comics?.some((comic) => comic.status === "generating")) {
    timer = setTimeout(() => void pollGenerating(), POLL_MS);
  }
}

async function pollGenerating() {
  const busy = snapshot.comics?.filter((comic) => comic.status === "generating") ?? [];
  const fresh = await Promise.all(
    busy.map((comic) =>
      api<{ comic: Comic }>(`/api/comics/${comic.id}`)
        .then((r) => r.comic)
        .catch(() => null),
    ),
  );
  const updates = new Map(fresh.filter((c): c is Comic => c !== null).map((c) => [c.id, c]));
  if (snapshot.comics && updates.size) {
    const comics = snapshot.comics.map((comic) => updates.get(comic.id) ?? comic);
    if (!same(comics, snapshot.comics)) publish({ ...snapshot, comics });
  }
  schedule();
}

export async function refreshLibrary(): Promise<void> {
  try {
    const data = await api<{ comics: Comic[]; info: StudioInfo }>("/api/comics");
    if (!same(data.comics, snapshot.comics) || !same(data.info, snapshot.info) || snapshot.error) {
      publish({ comics: data.comics, info: data.info, error: null });
    }
  } catch (error) {
    publish({ ...snapshot, error: (error as Error).message });
  }
  schedule();
}

/** Put a comic the server just returned into the snapshot without a full reload. */
export function upsertComic(comic: Comic): void {
  const comics = snapshot.comics ?? [];
  const exists = comics.some((c) => c.id === comic.id);
  publish({
    ...snapshot,
    comics: exists ? comics.map((c) => (c.id === comic.id ? comic : c)) : [comic, ...comics],
  });
  schedule();
}

export function dropComic(id: string): void {
  if (!snapshot.comics) return;
  publish({ ...snapshot, comics: snapshot.comics.filter((c) => c.id !== id) });
}

function onFocus() {
  void refreshLibrary();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("focus", onFocus);
    void refreshLibrary();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.removeEventListener("focus", onFocus);
      if (timer) clearTimeout(timer);
      timer = null;
    }
  };
}

export function useLibrary(): LibrarySnapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );
}
