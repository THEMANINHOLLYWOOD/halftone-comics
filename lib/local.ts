// What this device remembers: comics it has opened (their seal is broken)
// and comics it made (never bagged for their maker). Private
// browsing or a full store just means nothing is remembered.

type Store = Pick<Storage, "getItem" | "setItem">;

const OPENED = "comics-opened";
const MADE = "comics-made";
const LIMIT = 500;

function local(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readList(key: string, store: Store | null): string[] {
  try {
    const raw = store?.getItem(key);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function addTo(key: string, id: string, store: Store | null): void {
  try {
    const list = readList(key, store).filter((v) => v !== id);
    store?.setItem(key, JSON.stringify([id, ...list].slice(0, LIMIT)));
  } catch {
    // Not remembered; fine.
  }
}

export const isOpened = (id: string, store: Store | null = local()) => readList(OPENED, store).includes(id);
export const markOpened = (id: string, store: Store | null = local()) => addTo(OPENED, id, store);
export const isMade = (id: string, store: Store | null = local()) => readList(MADE, store).includes(id);
export const markMade = (id: string, store: Store | null = local()) => addTo(MADE, id, store);
