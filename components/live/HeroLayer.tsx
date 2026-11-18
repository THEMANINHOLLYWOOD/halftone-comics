"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FIGHT_COOLDOWN_MS, FIGHT_MS, fightOutcome, fightSender, heroBy, REACH_WORLD, type HeroId } from "@/lib/live/heroes";
import { usePresence } from "@/lib/live/presence";
import type { FightEvent } from "@/lib/live/room";
import type { Stage } from "@/lib/stage/engine";
import type { Pose } from "./HeroArt";
import { SuperCursor, tipOffset, type CursorState } from "./SuperCursor";

interface Props {
  getStage(): Stage | null;
  session: string;
  hero: HeroId;
  /** Your hero is on: your first press anywhere on the page does it. Until then it is dormant. */
  suited: boolean;
}

const CURSOR: Record<Pose, CursorState> = { idle: "rest", hover: "hover", move: "move", drag: "move", click: "act", ko: "ko", win: "win", work: "rest" };

/** Things a hero leans toward: anything you can press. */
const PRESSABLE = 'button, a[href], [role="button"], label, summary, select';
/** Where you type, the hero steps aside for the text caret. */
const TYPING = 'input:not([type="file"]):not([type="range"]), textarea, [contenteditable="true"]';

interface Burst {
  id: number;
  x: number;
  y: number;
  text: string;
  big?: boolean;
}

/** Fight outcomes and knockbacks, by session, until a time. */
type Override = { pose: Pose; until: number; kick: number };

/** The cursor's size; its tip sits exactly on the pointer. */
const SIZE = 34;
const TIP = tipOffset(SIZE);

const noSubscribe = () => () => {};

/**
 * Everyone's heroes over the page. Yours is your cursor on a computer, dormant
 * until your first press suits it up; the others glide to where their people
 * are pointing, placed on the stage itself so the same panel lines up on every
 * screen.
 */
export function HeroLayer({ getStage, session, hero, suited }: Props) {
  const { room, peers } = usePresence();
  const mine = useRef<HTMLDivElement>(null);
  const peerEls = useRef(new Map<string, HTMLDivElement>());
  const [pose, setPose] = useState<Pose>("idle");
  const [suiting, setSuiting] = useState(false);
  const [typing, setTyping] = useState(false);
  // On a computer the hero is the cursor from the moment you arrive, everywhere on the page.
  const coarse = useSyncExternalStore(noSubscribe, () => window.matchMedia("(pointer: coarse)").matches, () => false);
  useEffect(() => {
    if (coarse) return;
    document.documentElement.classList.add("hero-cursor");
    return () => document.documentElement.classList.remove("hero-cursor");
  }, [coarse]);
  const [shown, setShown] = useState(false);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const state = useRef({ x: -100, y: -100, world: null as null | { view: string; x: number; y: number }, down: false, lastMove: 0, cooldown: new Map<string, number>() });
  const latest = useRef({ room, peers, hero, session, overrides });
  // A coarse clock for poses that wear off (a win, a knockout, a click).
  const [now, setNow] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 200);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    latest.current = { room, peers, hero, session, overrides };
  });

  const burst = (x: number, y: number, text: string, big = false) => {
    const id = Math.random();
    setBursts((list) => [...list.slice(-6), { id, x, y, text, big }]);
    window.setTimeout(() => setBursts((list) => list.filter((b) => b.id !== id)), big ? FIGHT_MS : 700);
  };

  // Your hero: follow the pointer, act out what it does.
  useEffect(() => {
    const touchFirst = window.matchMedia("(pointer: coarse)").matches;
    let idleTimer = 0;
    const place = (event: PointerEvent) => {
      const s = state.current;
      s.x = event.clientX;
      s.y = event.clientY;
      if (mine.current) mine.current.style.transform = `translate(${s.x - TIP.x}px, ${s.y - TIP.y}px)`;
      s.world = getStage()?.unproject(s.x, s.y) ?? null;
      if (s.world) latest.current.room?.move(s.world.view, s.world.x, s.world.y);
    };
    /** Is the pointer on something it can press (a control, or the comic itself)? */
    const aimAt = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest?.(PRESSABLE)) return true;
      if (target?.tagName !== "CANVAS") return false;
      const r = getStage()?.sheetRect();
      return !!r && event.clientX >= r.left && event.clientX <= r.left + r.width && event.clientY >= r.top && event.clientY <= r.top + r.height;
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch" && !state.current.down) return;
      setShown(true);
      place(event);
      setTyping(!!(event.target as Element | null)?.closest?.(TYPING));
      const aim = aimAt(event);
      setPose((now) => (now === "click" ? now : state.current.down ? "drag" : aim ? "hover" : "move"));
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => setPose((now) => (now === "move" ? "idle" : now)), 160);
    };
    const down = (event: PointerEvent) => {
      state.current.down = true;
      setShown(true);
      place(event);
      // Pressing a control: the hero punches it. Pressing the comic: the hero takes hold.
      if ((event.target as Element | null)?.closest?.(PRESSABLE)) {
        setPose("click");
        latest.current.room?.act("click");
        window.clearTimeout(idleTimer);
        idleTimer = window.setTimeout(() => setPose((now) => (now === "click" ? "hover" : now)), 380);
        return;
      }
      setPose("drag");
      latest.current.room?.act("drag");
    };
    const up = (event: PointerEvent) => {
      const quick = state.current.down;
      state.current.down = false;
      place(event);
      if (!quick) return;
      setPose((now) => (now === "click" ? now : "idle"));
    };
    const leave = () => {
      if (!touchFirst) setShown(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    document.addEventListener("pointerleave", leave);
    // The page says when a power fires or the suit goes on; the hero acts it out.
    const power = () => {
      setPose("click");
      latest.current.room?.act("click");
      burst(state.current.x + 22, state.current.y - SIZE, heroBy(latest.current.hero).sfx);
      window.setTimeout(() => setPose("idle"), 520);
    };
    const suit = () => {
      setSuiting(true);
      // Who you are, lettered as you suit up: heroes are dealt, so this is the introduction.
      // (After this press has placed the hero: on a phone it is the first touch.)
      window.setTimeout(() => burst(state.current.x + 22, state.current.y - SIZE, `${heroBy(latest.current.hero).name.toUpperCase()}!`), 0);
      window.setTimeout(() => setSuiting(false), 720);
    };
    window.addEventListener("hero-power", power);
    window.addEventListener("hero-suit", suit);
    return () => {
      window.removeEventListener("hero-power", power);
      window.removeEventListener("hero-suit", suit);
      window.clearTimeout(idleTimer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      document.removeEventListener("pointerleave", leave);
    };
  }, [getStage]);

  // Fights: whoever is first in the pair announces it; everyone plays it.
  useEffect(() => {
    if (!room) return;
    const play = (fight: FightEvent) => {
      const now = performance.now();
      const loser = fight.winner === fight.a ? fight.b : fight.a;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setOverrides((all) => ({
        ...all,
        [fight.winner]: { pose: "win", until: now + FIGHT_MS + 900, kick: 0 },
        [loser]: { pose: "ko", until: now + FIGHT_MS + 1600, kick: reduced ? 8 : 70 },
      }));
      if (reduced) return;
      // The burst goes where the fight is: at your hero if you are in it, else at the heroes fighting.
      const s = state.current;
      const word = ["POW!", "BAM!", "ZAP!", "KRAK!"][Math.floor(Math.random() * 4)];
      const me = latest.current.session;
      if (fight.a === me || fight.b === me) {
        burst(s.x, s.y - SIZE * 1.4, word, true);
        return;
      }
      const peer = latest.current.peers.find((p) => p.session === fight.a);
      const at = peer?.track.at(now);
      const screen = peer && at ? getStage()?.project(peer.view, at.x, at.y) : null;
      if (screen) burst(screen.x, screen.y - SIZE * 1.4, word, true);
    };
    return room.onFight(play);
  }, [room, getStage]);

  // Standing still is still being here: repeat where your hero is every couple of seconds.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const w = state.current.world;
      if (w) latest.current.room?.move(w.view, w.x, w.y);
    }, 2000);
    return () => window.clearInterval(timer);
  }, []);

  // Every frame: put the others where they are, and check for scraps.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const stage = getStage();
      const { room: r, peers: list, hero: myHero, session: me, overrides: over } = latest.current;
      if (!stage) return;
      const now = performance.now();
      const s = state.current;
      for (const peer of list) {
        const el = peerEls.current.get(peer.session);
        if (!el) continue;
        const at = peer.track.at(now);
        const screen = at && !peer.track.stale(now) ? stage.project(peer.view, at.x, at.y) : null;
        if (!screen) {
          el.style.opacity = "0";
          continue;
        }
        const o = over[peer.session];
        const kick = o && o.until > now ? o.kick * Math.max(0, (o.until - now) / 1600) : 0;
        el.style.opacity = "1";
        el.style.transform = `translate(${screen.x - TIP.x + kick}px, ${screen.y - TIP.y}px)`;
        // Touching heroes scrap, measured on the stage so every screen agrees.
        if (r && s.world && peer.view === s.world.view && at && fightSender(me, peer.session)) {
          const near = Math.hypot(at.x - s.world.x, at.y - s.world.y) < REACH_WORLD;
          const last = s.cooldown.get(peer.session) ?? 0;
          if (near && now - last > FIGHT_COOLDOWN_MS) {
            s.cooldown.set(peer.session, now);
            const side = fightOutcome(myHero, peer.hero, Math.random());
            const event = { a: me, b: peer.session, winner: side === "a" ? me : peer.session };
            r.fight(event);
            // The sender plays it too: broadcasts do not echo back.
            playLocal(event);
          }
        }
      }
    };
    const playLocal = (event: FightEvent) => {
      const now = performance.now();
      const loser = event.winner === event.a ? event.b : event.a;
      setOverrides((all) => ({
        ...all,
        [event.winner]: { pose: "win", until: now + FIGHT_MS + 900, kick: 0 },
        [loser]: { pose: "ko", until: now + FIGHT_MS + 1600, kick: 70 },
      }));
      burst(state.current.x, state.current.y - SIZE * 1.4, ["POW!", "BAM!", "ZAP!", "KRAK!"][Math.floor(Math.random() * 4)], true);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [getStage]);

  const myOverride = overrides[session];
  const myPose = myOverride && myOverride.until > now ? myOverride.pose : pose;
  const myState: CursorState = suiting ? "suit" : suited ? CURSOR[myPose] : "dormant";

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden>
      {peers.map((peer) => {
        const o = overrides[peer.session];
        const peerPose: Pose = o && o.until > now ? o.pose : peer.pose === "click" && now - peer.poseAt > 500 ? "idle" : peer.pose;
        return (
          <div
            key={peer.session}
            ref={(el) => {
              if (el) peerEls.current.set(peer.session, el);
              else peerEls.current.delete(peer.session);
            }}
            className="absolute top-0 left-0 opacity-0 transition-opacity duration-300 will-change-transform"
          >
            <SuperCursor hero={peer.hero} state={CURSOR[peerPose]} size={SIZE} />
          </div>
        );
      })}
      <div
        ref={mine}
        className={`absolute top-0 left-0 will-change-transform ${shown && !typing && (suited || !coarse) ? "opacity-100" : "opacity-0"}`}
      >
        <SuperCursor hero={hero} state={myState} size={SIZE} />
        {!coarse && !suited && <span className="hero-hint" style={{ left: SIZE * 0.72, top: SIZE * 0.62 }}>Click to suit up</span>}
      </div>
      {coarse && !suited && (
        <div className="hero-hint-pill">
          <SuperCursor hero={hero} size={22} badge />
          <span>Tap to suit up</span>
        </div>
      )}
      {bursts.map((b) => (
        <span
          key={b.id}
          className={`hero-sfx absolute ${b.big ? "text-[44px] text-[#ffd400]" : "text-[22px] text-paper"}`}
          style={{ left: b.x, top: b.y }}
        >
          {b.text}
        </span>
      ))}
    </div>
  );
}
