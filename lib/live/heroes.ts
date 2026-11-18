// The cast of original heroes every visitor plays as. Types sit on a wheel:
// each beats the three after it and loses to the three before; straight across
// is a coin toss.

export type HeroType = "speed" | "flight" | "power" | "tech" | "magic" | "stealth" | "elemental" | "nature";
export type HeroId = "volt" | "gale" | "brick" | "gearhead" | "hex" | "shade" | "splash" | "bloom";

/**
 * What a hero's cursor does to the comic on a tap: rip a bag open, blast or
 * dash to the next comic, strike or grab a page over, scan it full size,
 * open a portal to the index, or blink back.
 */
export type Power = "rip" | "blast" | "strike" | "grab" | "dash" | "scan" | "portal" | "blink";

export interface Hero {
  id: HeroId;
  name: string;
  type: HeroType;
  /** Suit colour and trim. */
  ink: string;
  accent: string;
  /** The lettered sound of their move. */
  sfx: string;
  /** What they do while making a comic. */
  job: string;
  /** Their cursor's signature move on the comics, and what it is called. */
  power: Power;
  move: string;
}

export const HEROES: Hero[] = [
  { id: "volt", name: "Volt", type: "speed", ink: "#ffd400", accent: "#141414", sfx: "ZAP!", job: "pencilling", power: "dash", move: "Lightning dash" },
  { id: "gale", name: "Gale", type: "flight", ink: "#00a4d6", accent: "#fbfbf9", sfx: "WHOOSH!", job: "inking", power: "blast", move: "Thruster blast" },
  { id: "brick", name: "Brick", type: "power", ink: "#d6321a", accent: "#ffd400", sfx: "POW!", job: "laying out panels", power: "rip", move: "Titan grip" },
  { id: "gearhead", name: "Gearhead", type: "tech", ink: "#6a6a65", accent: "#00a4d6", sfx: "BZZT!", job: "lettering", power: "scan", move: "Visor scan" },
  { id: "hex", name: "Hex", type: "magic", ink: "#7b2fbe", accent: "#ffd400", sfx: "FWOOM!", job: "writing the script", power: "portal", move: "Glyph portal" },
  { id: "shade", name: "Shade", type: "stealth", ink: "#141414", accent: "#e4007c", sfx: "BLINK!", job: "spotting blacks", power: "blink", move: "Shadow blink" },
  { id: "splash", name: "Splash", type: "elemental", ink: "#0a7ccf", accent: "#7fe0ff", sfx: "KRAKOOM!", job: "colouring", power: "strike", move: "Storm strike" },
  { id: "bloom", name: "Bloom", type: "nature", ink: "#2f9e44", accent: "#e4007c", sfx: "THWIP!", job: "painting the poster", power: "grab", move: "Vine grab" },
];

const WHEEL: HeroType[] = ["speed", "flight", "power", "tech", "magic", "stealth", "elemental", "nature"];

export function heroBy(id: string | null | undefined): Hero {
  return HEROES.find((h) => h.id === id) ?? HEROES[0];
}

export function randomHero(): HeroId {
  return HEROES[Math.floor(Math.random() * HEROES.length)].id;
}

/** Who wins when two heroes meet: "a" or "b". */
export function fightOutcome(a: HeroId, b: HeroId, roll: number): "a" | "b" {
  const d = (WHEEL.indexOf(heroBy(b).type) - WHEEL.indexOf(heroBy(a).type) + 8) % 8;
  if (d >= 1 && d <= 3) return "a";
  if (d >= 5) return "b";
  return roll < 0.5 ? "a" : "b";
}

/** Of the two heroes in a scrap, only one announces it, so it happens once. */
export function fightSender(self: string, other: string): boolean {
  return self < other;
}

export const FIGHT_MS = 1200;
export const FIGHT_COOLDOWN_MS = 5000;
/** How close counts as touching: world units over the stage, screen fractions elsewhere. */
export const REACH_WORLD = 0.08;
export const REACH_SCREEN = 0.03;
