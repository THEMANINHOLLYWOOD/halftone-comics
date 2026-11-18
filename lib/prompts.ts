// Every prompt the studio sends: the writer's brief that turns sources into a
// script, and the art direction for each kind of sheet.

import { BRAND } from "./brand";
import { IMPRINT, type Era } from "./eras";
import type { ComicScript, ScriptPage } from "./types";

export function pageRange(
  requested: number,
  videoSeconds: number | null,
  single = false,
): { min: number; max: number } {
  // A single is a front and back cover only, until someone adds to it.
  if (single) return { min: 0, max: 0 };
  if (requested > 0) return { min: requested, max: requested };
  // Left to the story: longer videos earn more pages.
  if (videoSeconds && videoSeconds > 0) {
    const fit = Math.round(videoSeconds / 22) + 2;
    const max = Math.min(Math.max(fit, 4), 12);
    return { min: Math.max(3, max - 3), max };
  }
  return { min: 3, max: 6 };
}

export function scriptSystem(era: Era, range: { min: number; max: number }, hasVideo: boolean): string {
  const count = range.min === range.max ? `exactly ${range.min}` : `between ${range.min} and ${range.max}`;
  return [
    `You are a veteran comic book writer and editor at ${IMPRINT}. You turn whatever you are handed (notes, photos, documents, web pages, audio, video) into the full script for one complete, self-contained comic book issue.`,
    "",
    `The book is being made in this tradition: ${era.name} (${era.years}). ${era.blurb} Write the narration, pacing and dialogue the way books of that kind were written.`,
    "",
    "Rules for the script:",
    range.max === 0
      ? "- This is a SINGLE: write NO interior pages (`pages` is an empty list). Put the whole story into one strong cover image and its back cover, and still write the full cast."
      : `- Write ${count} interior story pages, each with 3 to 6 panels. Vary the panel count from page to page.`,
    "- Stay faithful to the source material. Use the real events, places, objects and words in it. Do not invent a different story when one is already there; heighten what is there.",
    hasVideo
      ? "- A video was supplied. Adapt the ENTIRE video from its first second to its last, in order, spread evenly across the pages; do not stop partway and do not skip its ending. Give every panel a `timestamp`: the second of the video that panel is drawn from. Timestamps must be real moments that are actually in the video and must increase through the book. Lift dialogue from what is actually said, trimmed to fit."
      : "- No video was supplied, so leave every `timestamp` out.",
    "- Characters: list everyone who appears. `look` is a drawing brief an artist can follow on every page: age range, build, hair, skin tone, face, and the exact clothes with colours. Use names given by the user or spoken in the source; if a real person is unnamed, give them a short descriptive nickname instead of guessing a name." +
      (hasVideo ? " For each character give the `timestamp` where they are seen most clearly, facing the camera." : ""),
    "- Each panel: `shot` is the camera (e.g. 'wide establishing shot', 'low-angle close-up'); `action` is what is drawn, in one or two concrete sentences that name who is in it.",
    "- Dialogue is short enough to letter: at most two balloons per panel, at most 14 words per balloon. Captions at most 16 words. Sound effects one word. Many panels should have no caption at all.",
    "- `title` is the masthead: 1 to 4 punchy words in capitals. `tagline` is a cover line of at most 8 words. `logline` is one sentence.",
    "- `cover.concept` describes one single iconic image, not a collage and not a panel grid. `cover.blurb` is a cover blurb of at most 6 words.",
    `- \`back.concept\` describes the back cover. For this kind of book that is: ${era.back}`,
    "- Tell it with the storytelling craft of the greatest comics ever made: a strong hook, rising stakes, cinematic beats, big splash moments and a payoff. Every page is story: no advertisements, product plugs or promotional pages anywhere, and `back.concept` is story too.",
    "- Keep it suitable for a general audience. No real brand logos and no existing comic characters.",
  ].join("\n");
}

/** A title someone typed: one tidy line, or nothing. */
export function cleanTitle(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const tidy = raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 60).trim();
  return tidy || undefined;
}

export function scriptRequest(prompt: string, notes: string[], title?: string): string {
  return [
    title ? `The title is fixed: "${title}". Use it exactly as \`title\`.\n` : "",
    prompt.trim()
      ? `What the person asked for:\n${prompt.trim()}`
      : "The person gave no written direction: make the best comic you can out of the material above.",
    notes.length ? `\nNotes about the material:\n- ${notes.join("\n- ")}` : "",
    "\nWrite the script now.",
  ].join("\n");
}

/** Asking for more pages of a comic that already exists. */
export function continuationRequest(script: ComicScript, prompt: string, notes: string[]): string {
  const so = script.pages.map((page, i) => `Page ${i + 1}: ${page.summary}`).join("\n");
  return [
    `This comic already exists: "${script.title}". ${script.logline}`,
    script.tagline ? `Cover line: ${script.tagline}` : "",
    `Its cover shows: ${script.cover.concept}`,
    so ? `The pages so far:\n${so}` : "It has no interior pages yet: it is a single, a cover and a back cover.",
    "",
    "The person added the material above to turn it into a fuller book. Write the NEW interior pages that continue this same comic: same title, same characters (add new ones only if the material brings them), same world and tone, picking up where it left off and ending on a satisfying beat before the back cover.",
    prompt.trim() ? `What the person asked for:\n${prompt.trim()}` : "",
    notes.length ? `Notes about the material:\n- ${notes.join("\n- ")}` : "",
    "\nWrite the new pages now.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function scriptSchema(range: { min: number; max: number }, hasVideo: boolean) {
  const str = { type: "string" };
  const stamp = hasVideo ? { timestamp: { type: "number" } } : {};
  return {
    type: "object",
    properties: {
      title: str,
      tagline: str,
      logline: str,
      setting: str,
      characters: {
        type: "array",
        items: {
          type: "object",
          properties: { name: str, look: str, ...stamp },
          required: ["name", "look"],
        },
      },
      cover: {
        type: "object",
        properties: { concept: str, blurb: str },
        required: ["concept", "blurb"],
      },
      pages: {
        type: "array",
        minItems: range.min,
        maxItems: range.max,
        items: {
          type: "object",
          properties: {
            summary: str,
            panels: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  shot: str,
                  action: str,
                  dialogue: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { speaker: str, text: str },
                      required: ["speaker", "text"],
                    },
                  },
                  caption: str,
                  sfx: str,
                  ...stamp,
                },
                required: hasVideo ? ["shot", "action", "dialogue", "timestamp"] : ["shot", "action", "dialogue"],
              },
            },
          },
          required: ["summary", "panels"],
        },
      },
      back: { type: "object", properties: { concept: str }, required: ["concept"] },
    },
    required: ["title", "tagline", "logline", "setting", "characters", "cover", "pages", "back"],
  };
}

// ---- art direction --------------------------------------------------------

const FLAT_SCAN =
  "The image is a flat, straight-on scan of the printed sheet itself: the artwork fills the whole frame to the edges of the paper. No mock-up, no perspective, no hands, no desk, no shadow around it, no frame, no border outside the paper.";

/** The bar every drawing is held to: the craft of the greatest comic art ever made, never a static stock image. */
const DYNAMIC =
  "Draw it at the level of the greatest comic book art of all time: bold, dynamic, cinematic compositions; dramatic camera angles and foreshortening; expressive anatomy and acting; strong silhouettes; confident spotting of blacks and dramatic light; real sense of motion and impact; every image a showpiece. Never stiff stock poses, never generic clip-art, never an advertisement, product shot or promotional layout.";

const TEXT_RULES =
  "Spell every word exactly as written here and letter nothing else: no extra captions, no artist signature, no watermark, no credits, no real company names or logos.";

function cast(script: ComicScript): string {
  return script.characters.map((c) => `- ${c.name}: ${c.look}`).join("\n");
}

export function referenceNote(hasLikeness: boolean, hasScene: boolean, hasAnchor: boolean): string {
  const lines: string[] = [];
  if (hasAnchor) {
    lines.push(
      "The reference labelled COVER is the finished front cover of this same comic. Match its drawing style, line weight, palette, printing texture and character designs exactly, so this sheet clearly belongs to the same book.",
    );
  }
  if (hasLikeness) {
    lines.push(
      "References labelled LIKENESS show the real people and things in this story. Keep each person recognisable (face shape, hair, build, clothes) but redraw them completely in the comic's style.",
    );
  }
  if (hasScene) {
    lines.push(
      "References labelled SCENE are stills of the real moments behind the panels. Use them for staging, setting, props and wardrobe.",
    );
  }
  if (hasLikeness || hasScene) {
    lines.push("Never paste, trace or collage a photograph into the art: everything is drawn.");
  }
  return lines.join(" ");
}

export function coverPrompt(script: ComicScript, era: Era, issue: number, refs: string): string {
  return [
    `Draw the FRONT COVER of a comic book. Portrait, 2:3. ${FLAT_SCAN}`,
    "",
    `STYLE: ${era.art}`,
    `PRINTING: ${era.print}`,
    "",
    `COVER DESIGN: ${era.cover}`,
    `- Masthead title, large and perfectly legible: "${script.title}"`,
    `- Publisher mark, small, in a corner: a solid black box with the letters "${IMPRINT}" in heavy white type, and beside or under it in tiny capitals "${BRAND.line}"`,
    `- Issue number: "#${issue}"`,
    script.cover.blurb ? `- One cover blurb, only if this kind of cover carries one: "${script.cover.blurb}"` : "",
    "",
    `COVER IMAGE: ${script.cover.concept}`,
    DYNAMIC,
    `The story: ${script.logline} Setting: ${script.setting}`,
    "",
    "CHARACTERS:",
    cast(script),
    "",
    refs,
    TEXT_RULES,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function layoutHint(count: number): string {
  switch (count) {
    case 1: return "a single full-page splash panel";
    case 2: return "two stacked wide panels";
    case 3: return "three tiers, each one wide panel";
    case 4: return "a two-by-two grid, or one wide panel above three narrow ones";
    case 5: return "a wide establishing panel on top, then two rows of two";
    default: return "three tiers of two panels each";
  }
}

export function pagePrompt(
  script: ComicScript,
  page: ScriptPage,
  number: number,
  era: Era,
  refs: string,
): string {
  const panels = page.panels.map((panel, i) => {
    const lines = [`PANEL ${i + 1} — ${panel.shot}. ${panel.action}`];
    for (const line of panel.dialogue ?? []) {
      if (line.text?.trim()) lines.push(`  Balloon, ${line.speaker}: "${line.text.trim()}"`);
    }
    if (panel.caption?.trim()) lines.push(`  Caption box: "${panel.caption.trim()}"`);
    if (panel.sfx?.trim()) lines.push(`  Sound effect: "${panel.sfx.trim()}"`);
    return lines.join("\n");
  });

  return [
    `Draw ONE complete interior page of a comic book: page ${number} of "${script.title}". Portrait, 2:3. ${FLAT_SCAN}`,
    "",
    `STYLE: ${era.art}`,
    `PRINTING: ${era.print}`,
    `LETTERING: ${era.lettering}`,
    "",
    DYNAMIC,
    `LAYOUT: ${page.panels.length} panels, read left to right and top to bottom: ${layoutHint(page.panels.length)}. Clean even gutters between panels and a paper margin around the page. Draw exactly these panels, in this order:`,
    "",
    panels.join("\n\n"),
    "",
    `Setting: ${script.setting}`,
    "CHARACTERS (draw them the same way in every panel):",
    cast(script),
    "",
    refs,
    `Every balloon's tail points at its speaker. ${TEXT_RULES}`,
  ].join("\n");
}

export function backPrompt(script: ComicScript, era: Era, refs: string): string {
  return [
    `Draw the BACK COVER of the comic book "${script.title}". Portrait, 2:3. ${FLAT_SCAN}`,
    "",
    `STYLE: ${era.art}`,
    `PRINTING: ${era.print}`,
    "",
    "WHAT IT SHOWS: the same moment as the front cover, seen from the opposite side, as if the reader walked around the scene: the same characters from behind or from the far side, the same place, light and weather, what was behind the front cover's viewpoint now in view. Together the front and back covers read as one continuous wraparound scene.",
    `Front cover image, for reference: ${script.cover.concept}`,
    DYNAMIC,
    `Extra detail for the back: ${script.back.concept}`,
    `It belongs to the world of this story: ${script.logline}`,
    `${era.back} Keep the back-cover furniture small so the scene carries it. The only publisher name anywhere on it is the "${IMPRINT}" mark (a solid black box with "${IMPRINT}" in heavy white type) with "${BRAND.line}" in tiny capitals, small, at the bottom.`,
    "",
    refs,
    "Keep any text short and perfectly legible. No real company names or logos, no watermark, no signature.",
  ].join("\n");
}

/** One wide promotional piece for the comic's share link. */
export function sharePrompt(script: ComicScript, era: Era, issue: number): string {
  return [
    `Draw a wide LANDSCAPE promotional banner, 3:2, for the comic book "${script.title}" #${issue}, as if it were a poster on a comic shop wall announcing the issue. ${FLAT_SCAN}`,
    "",
    `STYLE: ${era.art}`,
    `PRINTING: ${era.print}`,
    "",
    DYNAMIC,
    "COMPOSITION: the hero moment of this story staged wide and cinematic, characters large on the left two thirds, matching the attached front cover exactly (same characters, costumes, colours and drawing style). Leave calm space on the right third for the title.",
    `- The title, huge and perfectly legible, in the same masthead lettering as the cover: "${script.title}"`,
    script.tagline ? `- One short line under it: "${script.tagline}"` : "",
    `- The publisher mark, small: a solid black box with "${IMPRINT}" in heavy white type, and "${BRAND.line}" in tiny capitals`,
    "",
    `The story: ${script.logline} Setting: ${script.setting}`,
    "CHARACTERS:",
    cast(script),
    "",
    "Nothing important within 6% of any edge: the image will be cropped slightly. No real company names or logos, no watermark, no signature.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** Redrawing an existing page with one change, optionally pointed at with red marks. */
export function editPrompt(base: string, change: string, hasMarks: boolean): string {
  return [
    "This is a REVISION of a page that is already drawn. The reference labelled CURRENT is the page as it is now.",
    `Make this change: ${change.trim()}`,
    hasMarks
      ? "The reference labelled MARKED is the same page with red loops and rings drawn around exactly what to change. Change only what is inside those marks, and never draw the red marks themselves."
      : "",
    "Keep everything else exactly as it is: the same layout, panels, characters, lettering, colours and drawing style.",
    "",
    "The original brief for this page, for reference:",
    base,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

