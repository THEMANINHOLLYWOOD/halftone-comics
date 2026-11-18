"use client";

// A live room on Supabase Realtime: who is here (presence) and where their
// heroes are (broadcast). One room for the shelf, one per comic being read.
// Nothing is stored; if the service refuses or limits us, the room goes quiet.

import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../session";
import { sendRate } from "./budget";
import type { HeroId } from "./heroes";
import { Track } from "./interp";

export type Place = "shelf" | `comic:${string}`;
export type PeerPose = "idle" | "move" | "hover" | "drag" | "click";

export interface Me {
  session: string;
  hero: HeroId;
  input: "mouse" | "touch";
}

export interface Peer {
  session: string;
  hero: HeroId;
  input: "mouse" | "touch";
  view: string;
  track: Track;
  pose: PeerPose;
  poseAt: number;
}

export interface FightEvent {
  a: string;
  b: string;
  winner: string;
}

const MAX_PEERS = 20;

export class Room {
  peers = new Map<string, Peer>();
  down = false;
  private channel: RealtimeChannel | null = null;
  private lastSend = 0;
  private fightListeners = new Set<(fight: FightEvent) => void>();
  private changeListeners = new Set<() => void>();

  constructor(
    readonly place: Place,
    private me: Me,
  ) {
    void this.start();
  }

  private left = false;

  private async start() {
    const sb = supabase();
    const me = this.me;
    const place = this.place;
    if (!sb) {
      this.down = true;
      return;
    }
    // A channel for this place may still be closing from a moment ago: let it finish first,
    // or the client hands back that old, already-subscribed channel.
    const topic = `realtime:place:${place}`;
    for (const old of sb.getChannels().filter((c) => c.topic === topic)) await sb.removeChannel(old);
    if (this.left) return;
    const channel = sb.channel(`place:${place}`, {
      config: { presence: { key: me.session }, broadcast: { self: false } },
    });
    channel
      .on("presence", { event: "sync" }, () => this.syncPresence())
      .on("broadcast", { event: "move" }, ({ payload }) => {
        const peer = this.peers.get(payload?.s);
        if (!peer || typeof payload.x !== "number" || typeof payload.y !== "number") return;
        peer.view = String(payload.v ?? "");
        peer.track.push(payload.x, payload.y, performance.now());
      })
      .on("broadcast", { event: "act" }, ({ payload }) => {
        const peer = this.peers.get(payload?.s);
        if (!peer) return;
        peer.pose = payload.p as PeerPose;
        peer.poseAt = performance.now();
        this.emitChange();
      })
      .on("broadcast", { event: "fight" }, ({ payload }) => {
        if (payload?.a && payload?.b && payload?.winner) for (const listener of this.fightListeners) listener(payload as FightEvent);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Back after a blip: live again.
          this.down = false;
          void channel.track({ hero: this.me.hero, input: this.me.input });
          this.emitChange();
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          this.down = true;
          this.emitChange();
        }
      });
    this.channel = channel;
  }

  private syncPresence() {
    const state = this.channel?.presenceState<{ hero: HeroId; input: "mouse" | "touch" }>() ?? {};
    const seen = new Set<string>();
    for (const [session, metas] of Object.entries(state)) {
      if (session === this.me.session || seen.size >= MAX_PEERS) continue;
      const meta = metas[metas.length - 1];
      if (!meta) continue;
      seen.add(session);
      const known = this.peers.get(session);
      if (known) {
        known.hero = meta.hero;
        known.input = meta.input;
      } else {
        this.peers.set(session, { session, hero: meta.hero, input: meta.input, view: "", track: new Track(), pose: "idle", poseAt: 0 });
      }
    }
    for (const session of [...this.peers.keys()]) if (!seen.has(session)) this.peers.delete(session);
    this.emitChange();
  }

  /** Everyone here, you included. */
  get people(): number {
    return this.peers.size + 1;
  }

  /** Where your hero is: sent only when someone else is here, and less often as the room fills. */
  move(view: string, x: number, y: number) {
    const rate = sendRate(this.people);
    if (!rate || this.down || !this.channel) return;
    const now = performance.now();
    if (now - this.lastSend < 1000 / rate) return;
    this.lastSend = now;
    void this.channel.send({ type: "broadcast", event: "move", payload: { s: this.me.session, v: view, x: +x.toFixed(4), y: +y.toFixed(4) } });
  }

  act(pose: PeerPose) {
    if (this.people < 2 || this.down || !this.channel) return;
    void this.channel.send({ type: "broadcast", event: "act", payload: { s: this.me.session, p: pose } });
  }

  fight(event: FightEvent) {
    if (this.down || !this.channel) return;
    void this.channel.send({ type: "broadcast", event: "fight", payload: event });
  }

  setHero(hero: HeroId) {
    this.me = { ...this.me, hero };
    void this.channel?.track({ hero, input: this.me.input });
  }

  onFight(listener: (fight: FightEvent) => void): () => void {
    this.fightListeners.add(listener);
    return () => this.fightListeners.delete(listener);
  }

  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  private emitChange() {
    for (const listener of this.changeListeners) listener();
  }

  leave() {
    this.left = true;
    const channel = this.channel;
    this.channel = null;
    this.peers.clear();
    if (channel) void supabase()?.removeChannel(channel);
    this.emitChange();
  }
}
