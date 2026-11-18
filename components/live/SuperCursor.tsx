// A hero's cursor: an arrow pointer in that hero's armour, with their power
// coming off it. Dormant it is a plain white arrow, like anyone's; suiting up
// snaps the plating on. It leans toward anything it can press, recoils on a
// press, and has its win and knock-out moments in a scrap.

import { useId } from "react";
import { heroBy } from "@/lib/live/heroes";
import { ARROW, CURSOR_ART, GRID, TIP } from "./cursorArt";

export type CursorState = "dormant" | "rest" | "hover" | "move" | "act" | "suit" | "win" | "ko";

/** Where the clicking tip sits inside a cursor drawn at `size` pixels. */
export function tipOffset(size: number) {
  return { x: (TIP.x / GRID) * size, y: (TIP.y / GRID) * size };
}

export function SuperCursor({
  hero,
  state = "rest",
  size = 34,
  badge = false,
}: {
  hero: string;
  state?: CursorState;
  size?: number;
  /** Shown as a face in a round chip: centred, without its power. */
  badge?: boolean;
}) {
  const h = heroBy(hero);
  const art = CURSOR_ART[h.id];
  const clip = useId();
  const tip = tipOffset(size);
  const origin = `${tip.x}px ${tip.y}px`;
  return (
    <span
      className={`super super-${h.id} super-${state} ${badge ? "super-badge" : ""}`}
      style={{ width: size, height: size, ["--suit" as string]: h.ink, ["--trim" as string]: h.accent }}
      aria-hidden
    >
      <span className="super-fx" style={{ transformOrigin: origin }}>
        <svg viewBox={`0 0 ${GRID} ${GRID}`} width={size} height={size} overflow="visible">
          {art.fx}
        </svg>
      </span>
      <span className="super-body" style={{ transformOrigin: origin }}>
        <svg viewBox={`0 0 ${GRID} ${GRID}`} width={size} height={size} overflow="visible">
          <defs>
            <clipPath id={clip}>
              <path d={ARROW} />
            </clipPath>
          </defs>
          <path className="super-arrow" d={ARROW} />
          <g className="super-armor" clipPath={`url(#${clip})`}>
            {/* A bevel of light down the leading edge, on every suit. */}
            <path d="M5.4 6.6 V22.6" stroke="#fff" strokeWidth="1" opacity="0.4" />
            {art.armor}
          </g>
          <path className="super-outline" d={ARROW} />
        </svg>
      </span>
      {/* The flash of a power or a suit-up, from the tip. */}
      <span className="super-burst" style={{ left: tip.x, top: tip.y }}>
        <svg viewBox="-12 -12 24 24" width={size * 0.9} height={size * 0.9} overflow="visible">
          <g stroke="var(--suit)" strokeWidth="2" strokeLinecap="round">
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
              <path key={a} d="M0 -6 V-10.5" transform={`rotate(${a})`} />
            ))}
          </g>
        </svg>
      </span>
      {state === "ko" && <span className="super-stars">✦ ✦ ✦</span>}
    </span>
  );
}
