// The heroes, drawn small in black ink with flat colour. Each pose is a class
// the stylesheet animates (idle bob, move lean, hover, drag, click burst, KO, win).

import { heroBy, type HeroId } from "@/lib/live/heroes";

export type Pose = "idle" | "move" | "hover" | "drag" | "click" | "ko" | "win" | "work";

const INK = "#141414";

/** Each hero's own silhouette details, drawn on the shared body. */
function Features({ id, ink, accent }: { id: HeroId; ink: string; accent: string }) {
  switch (id) {
    case "volt":
      return (
        <>
          <path d="M17 9l3-5 2 4 3-5 2 5 3-4 1 6" fill={ink} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M25 27l-4 6h4l-2 6 6-8h-4l2-4z" fill={accent} stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
        </>
      );
    case "gale":
      return (
        <>
          <path className="hero-cape" d="M16 25c-6 6-8 14-6 19 4-2 8-3 12-3M32 25c6 6 8 14 6 19-4-2-8-3-12-3" fill={ink} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M21 31c2-2 6-2 7 0s-2 4-4 3" fill="none" stroke={accent} strokeWidth="1.8" strokeLinecap="round" />
        </>
      );
    case "brick":
      return (
        <>
          <path d="M12 26h24v6H12z" fill={ink} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
          <rect x="21" y="29" width="6" height="6" rx="1" fill={accent} stroke={INK} strokeWidth="1.2" />
        </>
      );
    case "gearhead":
      return (
        <>
          <path d="M24 5v-3M24 2a1.5 1.5 0 1 0 0 .01" stroke={INK} strokeWidth="1.6" fill={accent} />
          <rect x="16" y="13" width="16" height="5" rx="2.5" fill={accent} stroke={INK} strokeWidth="1.4" />
          <circle cx="24" cy="31" r="3.5" fill="none" stroke={accent} strokeWidth="2" strokeDasharray="2 1.6" />
        </>
      );
    case "hex":
      return (
        <>
          <path d="M14 18c1-8 5-15 10-16 5 1 9 8 10 16" fill={ink} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M24 27l1.4 3 3.2.3-2.4 2 .8 3.1-3-1.7-3 1.7.8-3.1-2.4-2 3.2-.3z" fill={accent} stroke={INK} strokeWidth="0.9" />
        </>
      );
    case "shade":
      return (
        <>
          <path d="M14 15c0-6 4-10 10-10s10 4 10 10v3H14z" fill={ink} stroke={INK} strokeWidth="1.6" />
          <path className="hero-cape" d="M17 24h14l6 4-4 1" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case "splash":
      return (
        <>
          <path d="M14 13c3-6 7-9 10-9 2 3 1 5-1 6 4-1 8 0 11 3" fill={accent} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M19 31c2-2 3-2 5 0s3 2 5 0" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" />
        </>
      );
    case "bloom":
      return (
        <>
          <path d="M17 8c1-3 3-4 4-2-1-3 2-5 3-3 1-2 4 0 3 3 1-2 3-1 4 2" fill={accent} stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M24 35c-4-2-5-6-2-9 3 2 4 6 2 9z" fill={accent} stroke={INK} strokeWidth="1.2" />
        </>
      );
  }
}

/** One hero, about `size` px tall, facing left (-1) or right (1). */
export function HeroArt({ hero, pose = "idle", facing = 1, size = 44 }: { hero: string; pose?: Pose; facing?: 1 | -1; size?: number }) {
  const h = heroBy(hero);
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={`hero hero-${pose} hero-${h.id}`}
      style={{ transform: `scaleX(${facing})` }}
      aria-hidden
    >
      <g className="hero-body">
        {/* legs */}
        <path className="hero-legs" d="M20 37l-3 8M28 37l3 8" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />
        {/* torso */}
        <path d="M16 24c0-3 3-5 8-5s8 2 8 5v11c0 2-2 3-4 3h-8c-2 0-4-1-4-3z" fill={h.ink} stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
        {/* arms: the right one does the moves */}
        <path d="M16 26l-5 6" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        <path className="hero-arm" d="M32 26l5 6" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        {/* head and mask */}
        <circle cx="24" cy="14" r="8" fill="#f6d7b8" stroke={INK} strokeWidth="1.8" />
        <path d="M16.5 13c2-1.6 13-1.6 15 0l-1 3c-2-1-11-1-13 0z" fill={INK} />
        <circle cx="21" cy="14.2" r="0.9" fill="#fff" />
        <circle cx="27" cy="14.2" r="0.9" fill="#fff" />
        <Features id={h.id} ink={h.ink} accent={h.accent} />
      </g>
      {(pose === "click" || pose === "win") && (
        <g className="hero-burst">
          <path d="M38 4l2 5 5-2-3 5 5 2-5 2 2 5-5-2-2 5-2-5-5 2 2-5-5-2 5-2-2-5 5 2z" fill="#ffd400" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
        </g>
      )}
      {pose === "ko" && (
        <g className="hero-dizzy" fill="#ffd400" stroke={INK} strokeWidth="0.8">
          <path d="M14 3l1 2 2 .2-1.6 1.3.5 2-1.9-1-1.9 1 .5-2-1.6-1.3 2-.2z" />
          <path d="M33 2l1 2 2 .2-1.6 1.3.5 2-1.9-1-1.9 1 .5-2-1.6-1.3 2-.2z" />
        </g>
      )}
    </svg>
  );
}
