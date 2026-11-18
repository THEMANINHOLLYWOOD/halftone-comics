// The heroes' cursors are arrow pointers in armour: the same arrow everyone
// knows, plated in a hero's colours, with their power coming off it (thrusters,
// sparks, a glyph ring...). Drawn on a 32-unit grid; the tip is the hotspot.

import type { ReactNode } from "react";
import type { HeroId } from "@/lib/live/heroes";

/** The pointer itself. */
export const ARROW = "M4 3 L4 25.5 L9.6 20.4 L13.4 29 L17.3 27.3 L13.6 18.9 L21 18.9 Z";
/** The point that clicks, in grid units. */
export const TIP = { x: 4, y: 3 };
export const GRID = 32;

const INK = "#141414";

/** A jet of flame drawn from its nozzle (0, 0) downward; the stylesheet flickers and stretches it. */
function Jet({ x, y, angle, size = 1 }: { x: number; y: number; angle: number; size?: number }) {
  // Tucked a unit under the tail so the flame leaves the armour, not the air beside it.
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${size}) translate(0 -1)`}>
      <g className="super-thrust">
        <ellipse className="super-flame" cx="0" cy="5" rx="4.2" ry="7.5" fill="#29b6f6" opacity="0.28" />
        <path className="super-flame" d="M-3 0 C-3.2 3.6 -1.6 7.4 0 12 C1.6 7.4 3.2 3.6 3 0 Z" fill="#29b6f6" />
        <path className="super-flame super-flame-core" d="M-2 0 C-2.1 2.6 -1 5.2 0 8 C1 5.2 2.1 2.6 2 0 Z" fill="#9be7ff" />
        <path className="super-flame super-flame-core" d="M-1.1 0 C-1.2 1.6 -0.5 3.2 0 4.6 C0.5 3.2 1.2 1.6 1.1 0 Z" fill="#ffffff" />
      </g>
    </g>
  );
}

/** Where the tail of the arrow ends, and the way it points (for jets and trails). */
const TAIL = { x: 15.35, y: 28.15, angle: -23.6 };

interface CursorArt {
  /** Plating drawn on the arrow (clipped to it). */
  armor: ReactNode;
  /** The power, drawn around and behind the arrow. */
  fx: ReactNode;
}

export const CURSOR_ART: Record<HeroId, CursorArt> = {
  // Flight: jets at the tail and the heel, a glowing chest light, white plate seams.
  gale: {
    armor: (
      <>
        <path d="M4 14.4 L10.6 16.1 L17.4 17.4" stroke="#fbfbf9" strokeWidth="1.1" fill="none" />
        <path d="M5.6 7.6 L8.6 10.2" stroke="#fbfbf9" strokeWidth="0.9" strokeLinecap="round" />
        <circle cx="8.3" cy="18.4" r="2.5" fill="#7fdcff" opacity="0.55" className="super-glow" />
        <circle cx="8.3" cy="18.4" r="1.35" fill="#effcff" />
      </>
    ),
    fx: (
      <>
        <Jet x={TAIL.x} y={TAIL.y} angle={TAIL.angle} />
        <Jet x={5.2} y={25.2} angle={8} size={0.62} />
      </>
    ),
  },
  // Speed: a black bolt on yellow plate, speed streaks off the tail, sparks at the tip.
  volt: {
    armor: <path d="M9.4 7.4 L6.4 13.8 L9 13.8 L7 20.4 L12.9 12.4 L10 12.4 L11.8 7.4 Z" fill={INK} />,
    fx: (
      <>
        <g className="super-streaks" stroke="#ffd400" strokeWidth="1.5" strokeLinecap="round">
          <path d="M14.6 30.4 L17.4 36.8" />
          <path d="M11.2 29.4 L13 33.6" />
          <path d="M18.9 28.8 L20.9 33.4" />
        </g>
        <path className="super-spark" d="M1.6 0.4 L0.2 2.4 L1.8 2.4 L0.4 4.6" stroke="#ffd400" strokeWidth="0.9" fill="none" strokeLinejoin="round" />
      </>
    ),
  },
  // Strength: heavy plate with rivets and a stress crack; the press lands with impact lines.
  brick: {
    armor: (
      <>
        <path d="M7.4 10.6 L9.4 12.6 L8.4 14.6 L10.6 16.6" stroke="#7a1a0c" strokeWidth="0.8" fill="none" strokeLinejoin="round" />
        {[
          [5.9, 8],
          [5.9, 19.8],
          [12.4, 15.4],
          [16.8, 17.4],
        ].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="0.85" fill="#ffd400" stroke={INK} strokeWidth="0.35" />
        ))}
      </>
    ),
    fx: (
      <g className="super-impact" stroke={INK} strokeWidth="1.2" strokeLinecap="round">
        <path d="M23.4 21 L26.6 22.2" />
        <path d="M21.6 24.6 L24 26.8" />
        <path d="M19.2 31 L20.2 34" />
      </g>
    ),
  },
  // Tech: gunmetal plate, cyan circuits, a scan line sweeping down it, a targeting reticle at the tip.
  gearhead: {
    armor: (
      <>
        <path d="M5.4 9 H8 V14 H11 M8 14 V21.4 M11 14 L13.6 16.6" stroke="#00a4d6" strokeWidth="0.85" fill="none" />
        <circle cx="11" cy="14" r="0.9" fill="#7fe0ff" />
        <circle cx="8" cy="21.4" r="0.9" fill="#7fe0ff" />
        <rect className="super-scan" x="2" y="3" width="22" height="1.6" fill="#7fe0ff" opacity="0.6" />
      </>
    ),
    fx: (
      <g className="super-reticle" stroke="#00a4d6" strokeWidth="0.9" fill="none">
        <circle cx={TIP.x} cy={TIP.y} r="5.4" strokeDasharray="2.4 2" />
        <path d={`M${TIP.x} ${TIP.y - 7.4} v2 M${TIP.x} ${TIP.y + 5.4} v2 M${TIP.x - 7.4} ${TIP.y} h2 M${TIP.x + 5.4} ${TIP.y} h2`} />
      </g>
    ),
  },
  // Magic: a gold glyph on violet, a turning rune ring round the tip, a few twinkles.
  hex: {
    armor: (
      <>
        <circle cx="8.6" cy="15.6" r="2.9" stroke="#ffd400" strokeWidth="0.85" fill="none" />
        <path d="M8.6 12.9 L11 17 L6.2 17 Z" stroke="#ffd400" strokeWidth="0.7" fill="none" />
      </>
    ),
    fx: (
      <>
        <circle className="super-runes" cx={TIP.x} cy={TIP.y} r="7.2" stroke="#b77cff" strokeWidth="1" strokeDasharray="1 2.2" fill="none" />
        <path className="super-twinkle" d="M22.4 9 l0.7 1.7 1.7 0.7 -1.7 0.7 -0.7 1.7 -0.7 -1.7 -1.7 -0.7 1.7 -0.7 z" fill="#ffd400" />
        <path className="super-twinkle super-twinkle-late" d="M-1.6 15 l0.5 1.2 1.2 0.5 -1.2 0.5 -0.5 1.2 -0.5 -1.2 -1.2 -0.5 1.2 -0.5 z" fill="#b77cff" />
      </>
    ),
  },
  // Stealth: black plate edged in magenta, eye slits, afterimages trailing behind.
  shade: {
    armor: (
      <>
        <path d="M5.7 7 L18.1 17.8" stroke="#e4007c" strokeWidth="0.9" />
        <path d="M6.2 11.4 L8.8 12.4" stroke="#e4007c" strokeWidth="0.9" strokeLinecap="round" />
      </>
    ),
    fx: (
      <g className="super-ghosts">
        <path d={ARROW} fill="#e4007c" opacity="0.3" />
        <path d={ARROW} fill="#e4007c" opacity="0.13" />
      </g>
    ),
  },
  // Storm: wave lines on deep blue, arcs of lightning crackling along the edges.
  splash: {
    armor: (
      <>
        <path d="M4.4 12.4 q1.8 -1.4 3.6 0 t3.6 0" stroke="#7fe0ff" strokeWidth="0.9" fill="none" />
        <path d="M4.4 16.6 q1.8 -1.4 3.6 0 t3.6 0 t3.6 0" stroke="#7fe0ff" strokeWidth="0.9" fill="none" />
      </>
    ),
    fx: (
      <g stroke="#7fe0ff" strokeWidth="1" fill="none" strokeLinejoin="round" strokeLinecap="round">
        <path className="super-arc" d="M9 4.6 L11.6 6.2 L10.4 7.4 L13.8 9.6 L12.6 10.8 L16.4 13.4" />
        <path className="super-arc super-arc-late" d="M2 9 L0.6 12 L2.2 12.8 L0.4 16.4 L2 17.4 L0.8 21" />
      </g>
    ),
  },
  // Nature: a leaf vein on green plate, a vine curling off the tail with a flower.
  bloom: {
    armor: (
      <>
        <path d="M4.6 22.4 C7.2 18.4 6.4 14.4 9.4 11.2" stroke="#1d6b2c" strokeWidth="0.9" fill="none" />
        <path d="M7 16.4 C8.8 16.2 10.2 15 10.8 13.6 C9 13.6 7.6 14.6 7 16.4 Z" fill="#7bd38a" />
      </>
    ),
    fx: (
      <g className="super-vine">
        <path d="M15.6 28.6 C17.4 31.4 20.6 31 21 28.6 C21.3 26.8 19.2 26.4 18.8 27.8" stroke="#2f9e44" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d="M17.2 31.2 C16 32.8 16.6 34.4 18.2 34 C18.6 32.8 18.2 31.8 17.2 31.2 Z" fill="#2f9e44" />
        <g transform="translate(22.4 26.2)">
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="0" cy="-1.5" rx="1" ry="1.5" fill="#e4007c" transform={`rotate(${a})`} />
          ))}
          <circle r="0.9" fill="#ffd400" />
        </g>
      </g>
    ),
  },
};
