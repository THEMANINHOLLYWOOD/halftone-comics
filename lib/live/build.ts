// While a comic is being made, the pipeline's status line becomes a studio:
// five steps, and the hero doing the current one.

import { heroBy, type HeroId } from "./heroes";

export const BUILD_STEPS = ["Script", "Pencils", "Inks", "Colors", "Letters"] as const;

export interface BuildStage {
  step: number;
  hero: HeroId;
  line: string;
}

export function buildStage(progress: string | undefined, done: number, total: number): BuildStage {
  const text = (progress ?? "").toLowerCase();
  const say = (hero: HeroId, what: string, step: number): BuildStage => ({ step, hero, line: `${heroBy(hero).name} is ${what}` });
  if (text.includes("reading")) return say("hex", "reading what you dropped in", 0);
  if (text.includes("writing")) return say("hex", "writing the script", 0);
  if (text.includes("stills")) return say("brick", "laying out panels from your video", 0);
  if (text.includes("cover")) return say("volt", "pencilling the cover", 1);
  if (text.includes("poster")) return say("bloom", "painting the poster", 4);
  if (text.includes("inking") || text.includes("drawing")) {
    const page = Math.min(done + 1, Math.max(total, 1));
    // The line moves down the studio as the book fills: inks, then colours, then letters.
    const share = total > 0 ? done / total : 0;
    if (share < 1 / 3) return say("gale", `inking page ${page}`, 2);
    if (share < 2 / 3) return say("splash", `colouring page ${page}`, 3);
    return say("gearhead", `lettering page ${page}`, 4);
  }
  return say("volt", "sharpening pencils", 1);
}
