"use client";

import { heroBy, type HeroId } from "@/lib/live/heroes";
import { usePresence } from "@/lib/live/presence";
import { SuperCursor } from "./SuperCursor";

/** Who is here: a small stack of hero faces, yours last. Heroes are dealt, never chosen. */
export function PresenceStack({ hero }: { hero: HeroId }) {
  const { peers } = usePresence();
  const others = peers.slice(0, 4);
  const you = heroBy(hero);
  return (
    <div className="flex items-center" title={peers.length ? `${peers.length + 1} here · you are ${you.name}` : `You are ${you.name}`}>
      <div className="flex -space-x-3">
        {others.map((peer) => (
          <span key={peer.session} className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-paper ring-2 ring-stage">
            <SuperCursor hero={peer.hero} size={26} badge />
          </span>
        ))}
        {peers.length > others.length && (
          <span className="grid h-9 w-9 place-items-center rounded-full bg-ink font-mono text-[10px] text-paper ring-2 ring-stage">+{peers.length - others.length}</span>
        )}
      </div>
      <span className="ml-1 grid h-11 w-11 place-items-center overflow-hidden rounded-full" aria-label={`You are ${you.name}`} role="img">
        <SuperCursor hero={hero} size={28} badge />
      </span>
    </div>
  );
}
