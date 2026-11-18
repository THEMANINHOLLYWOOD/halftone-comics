"use client";

// The one live room this tab is in, as a store components can read. The tab
// leaves while it is hidden and comes back when it is shown again.

import { useSyncExternalStore } from "react";
import { Room, type Me, type Peer, type Place } from "./room";

interface Snapshot {
  room: Room | null;
  peers: Peer[];
}

const EMPTY: Snapshot = { room: null, peers: [] };
let snapshot = EMPTY;
let wanted: { place: Place; me: Me } | null = null;
let current: Room | null = null;
let stopChange: (() => void) | null = null;
const listeners = new Set<() => void>();

function publish() {
  snapshot = { room: current, peers: current && !current.down ? [...current.peers.values()] : [] };
  for (const listener of listeners) listener();
}

function connect() {
  stopChange?.();
  current?.leave();
  current = null;
  if (wanted && typeof document !== "undefined" && document.visibilityState === "visible") {
    current = new Room(wanted.place, wanted.me);
    stopChange = current.onChange(publish);
  }
  publish();
}

let watching = false;
function watchVisibility() {
  if (watching || typeof document === "undefined") return;
  watching = true;
  document.addEventListener("visibilitychange", connect);
}

/** Be in this place (the shelf, or a comic), as this hero. */
export function joinPlace(place: Place, me: Me) {
  watchVisibility();
  const same = wanted && wanted.place === place && wanted.me.session === me.session;
  wanted = { place, me };
  if (same && current) {
    current.setHero(me.hero);
    return;
  }
  connect();
}

export function leavePlace() {
  wanted = null;
  connect();
}

export function usePresence(): Snapshot {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => EMPTY,
  );
}
