// Era presets. Each one describes a period of comics by how it was drawn,
// coloured, lettered and printed, so pages come back looking like a scan of a
// real book from that time rather than a generic "comic style" image.

import { BRAND } from "./brand";

export interface Era {
  id: string;
  name: string;
  years: string;
  blurb: string;
  /** Three inks that sum the era up, for the picker. */
  swatch: [string, string, string];
  /** Line art, colour and rendering. */
  art: string;
  /** Paper stock and printing artefacts. */
  print: string;
  /** Balloons, captions and sound effects. */
  lettering: string;
  /** Front-cover furniture: masthead, corner box, price, barcode. */
  cover: string;
  /** What the back cover of a book like this usually was. */
  back: string;
}

export const IMPRINT = BRAND.imprint;

export const ERAS: Era[] = [
  {
    id: "newsstand",
    name: "Newsstand",
    years: "1985–91",
    blurb: "Bold brush inks, flat four-colour, corner box and a 75¢ price.",
    swatch: ["#f2d21b", "#5f4aa8", "#c8372d"],
    art: "Late-1980s American newsstand comic art. Confident brush-and-pen inking with heavy spotted blacks, angular exaggerated anatomy, dramatic foreshortening and extreme close-ups. Flat hand-separated colour with at most a simple two-step cut-in shadow, no gradients, no airbrush, no digital rendering. Limited palette of saturated primaries against one cool background tone.",
    print: "Printed by web offset on cheap newsprint: slightly off-white paper showing through the light colours, visible coarse halftone dots in the tints, faint colour misregistration at edges, ink a little dry in the solid blacks.",
    lettering: "Hand-lettered upper-case comic lettering in white oval balloons with thin black outlines, rectangular yellow caption boxes, chunky hand-drawn sound effects.",
    cover: "Cover trade dress of a late-1980s monthly: a huge blocky 3D masthead logo across the top quarter, a small corner box at top left holding the imprint name, a tiny character head shot, the price '75¢ US', the issue number and month, and a small white UPC barcode box at bottom left. One single striking image fills the rest, no cover blurbs cluttering the art.",
    back: "Late-1980s back cover furniture, kept small: a slim strip along the bottom with the issue number and a little barcode box. The art is the hero, never an advertisement.",
  },
  {
    id: "golden",
    name: "Golden Age",
    years: "1938–55",
    blurb: "Pulp heroes, crude letterpress colour, yellowed pages.",
    swatch: ["#d9392b", "#f0c43c", "#2f5aa6"],
    art: "Golden Age comic art of the 1940s. Simple sturdy figures with stiff heroic poses, thick even outlines, minimal anatomy detail, plain backdrops with a few props. Colour is four flat inks only: bright red, yellow, blue and black, laid down in big simple areas.",
    print: "Letterpress on pulp paper that has yellowed to tan with age: colours printed visibly out of register, blotchy ink coverage, coarse dot screens, soft fuzzy line edges, slight foxing at the page borders.",
    lettering: "Rough hand lettering in upper case inside wobbly round balloons, narrow caption strips that begin with a large drop capital, simple block sound effects.",
    cover: "1940s ten-cent comic cover: a tall arched or banner masthead logo with a thick drop shadow, a circle reading '10¢', the issue number and month in small type at top, and a punchy boxed blurb in a corner. One crowded action scene below.",
    back: "1940s back cover furniture, kept small: a narrow banner with the issue number and '10¢'. The art is the hero, never an advertisement.",
  },
  {
    id: "silver",
    name: "Silver Age",
    years: "1956–69",
    blurb: "Cosmic energy, Ben-Day dots, bright primaries.",
    swatch: ["#e8452c", "#2e78c4", "#f6d936"],
    art: "Silver Age comic art of the 1960s. Dynamic blocky figures bursting out of the panel, squared-off fingers, bold machinery and crackling energy drawn as clusters of black dots, thick confident outlines with chunky feathering. Flat bright primary colours with Ben-Day dot tints for skin and skies.",
    print: "Four-colour letterpress on newsprint: clearly visible Ben-Day dots, slight misregistration, paper aged to a warm cream.",
    lettering: "Hand-lettered upper case with bold italic emphasis words, round balloons, jagged burst balloons for shouting, big outlined sound effects, caption boxes that address the reader.",
    cover: "1960s twelve-cent comic cover: a masthead logo in heavy slab letters across the top, a small corner box at top left with a standing figure and '12¢', a starburst blurb announcing the story, and one or two word balloons on the cover itself.",
    back: "1960s back cover furniture, kept small: a corner box with the issue number and '12¢'. The art is the hero, never an advertisement.",
  },
  {
    id: "bronze",
    name: "Bronze Age",
    years: "1970–84",
    blurb: "Moody, realistic, earth tones and street-level grit.",
    swatch: ["#8a5a2b", "#c9722e", "#3f5d4f"],
    art: "Bronze Age comic art of the 1970s. More realistic anatomy and faces, moody lighting with fine feathered hatching and deep shadows, cinematic camera angles, detailed urban or gothic backgrounds. Muted earthy palette of browns, oranges, olive and dusty blue with flat colour and occasional dot tints.",
    print: "Letterpress on rough newsprint aged to beige: slightly muddy colour, visible dot screens, soft blacks.",
    lettering: "Hand-lettered upper case, round balloons, torn-edge caption boxes for narration, thought bubbles with trailing circles, expressive brush sound effects.",
    cover: "1970s comic cover: masthead logo across the top with the series title, a strip banner above it carrying the imprint name, a corner price of '25¢', issue number and month, and one dramatic cover blurb in a jagged box near the bottom.",
    back: "1970s back cover furniture, kept small: a thin banner with the issue number and month. The art is the hero, never an advertisement.",
  },
  {
    id: "extreme",
    name: "Extreme ’90s",
    years: "1992–99",
    blurb: "Crosshatched muscle, gradients, foil-cover energy.",
    swatch: ["#19b6c9", "#e4257c", "#f08a1c"],
    art: "Early-1990s comic art. Hyper-detailed figures with exaggerated musculature, gritted teeth, endless fine crosshatching and speed lines, splash-page compositions with broken panel borders and characters overlapping the gutters. Early digital colouring with smooth gradients, lens flares and glowing energy effects in teal, magenta and orange.",
    print: "Glossy coated paper with sharp bright ink, tiny regular halftone dots, colours a little oversaturated.",
    lettering: "Upper-case comic lettering, balloons with coloured outlines for different speakers, jagged electric balloons, metallic bevelled sound effects.",
    cover: "1990s collector's-item cover: a spiky chrome-bevelled masthead logo, a small corner box with the imprint name and '$1.95', the words 'FIRST ISSUE' in a small burst, and a barcode box at bottom left. A full-figure pin-up pose leaping at the viewer.",
    back: "1990s back cover furniture, kept small: a tiny barcode box and a 'NEXT ISSUE' tag in a corner. The art is the hero, never an advertisement.",
  },
  {
    id: "modern",
    name: "Modern",
    years: "2005–now",
    blurb: "Clean digital inks, cinematic colour, widescreen panels.",
    swatch: ["#1f2a44", "#e06b3a", "#8fc1c9"],
    art: "Contemporary comic art. Clean precise digital inking with varied line weight, naturalistic proportions, widescreen cinematic panels, atmospheric lighting. Painterly digital colour with a restrained graded palette, soft rim light and subtle texture, no visible halftone.",
    print: "Modern offset printing on smooth bright-white matte paper, crisp edges, rich blacks, full bleed.",
    lettering: "Crisp digital comic lettering in mixed-size upper case, neat white balloons with thin outlines, borderless translucent caption boxes, restrained integrated sound effects.",
    cover: "Modern comic cover: a small refined logo at the top, the imprint name in tiny type in a top corner with the issue number and '$3.99', creator credit line left blank, and a barcode box at bottom left. One painterly iconic image with lots of breathing room.",
    back: "A modern back cover: a single quiet illustration continuing the cover's scene with a short teaser paragraph in small type and the imprint logo at the bottom.",
  },
  {
    id: "minimal",
    name: "Minimalist",
    years: "any year",
    blurb: "Flat shapes, two spot colours, lots of empty paper.",
    swatch: ["#111111", "#ff5a36", "#f3efe6"],
    art: "Minimalist graphic comic art. Characters and places reduced to simple flat geometric shapes with a single even hairline outline or none at all, faces suggested with a few marks, generous empty space in every panel. Exactly two spot colours plus black on the bare paper. No shading, no texture, no gradients.",
    print: "Screen-printed look on uncoated warm-white paper: perfectly flat ink, very slight overprint where the two colours overlap.",
    lettering: "Small tidy lower-case sans-serif lettering with no balloon outlines, each line joined to its speaker by a single thin stroke; captions set as plain text in the margins.",
    cover: "Minimalist cover: the title set small in lower-case sans-serif at the top left, the issue number at the top right, the imprint name in tiny type at the bottom, and one bold simple shape-based image floating in a wide field of bare paper.",
    back: "A minimalist back cover: one small icon from the story centred on bare paper, with a single line of small text beneath it.",
  },
  {
    id: "manga",
    name: "Manga",
    years: "tankōbon",
    blurb: "Black and white, screentone, speed lines. Reads left to right.",
    swatch: ["#111111", "#8c8c8c", "#f5f5f0"],
    art: "Black-and-white manga art. Fine pen line work, expressive faces with large eyes, dynamic speed lines and focus lines, screentone dot patterns for greys and shadows, dramatic panel shapes with diagonal cuts and characters breaking the frames. No colour at all on interior pages. Panels read left to right.",
    print: "Printed in black ink on slightly rough off-white paperback stock, screentone dots visible.",
    lettering: "Clean upper-case lettering in tall rounded balloons, spiky balloons for shouting, large brush sound effects drawn into the art in English.",
    cover: "Manga paperback cover in full colour: the title in bold stylised letters down one side or across the top, a volume number in a circle, the imprint name in small type at the bottom, and a single character illustration on a simple flat-colour background.",
    back: "A manga paperback back cover: a small character vignette on a flat colour field with a short story teaser in a box and a barcode at the bottom.",
  },
  {
    id: "ligne-claire",
    name: "Ligne claire",
    years: "Euro album",
    blurb: "Even clear outlines, flat colour, storybook detail.",
    swatch: ["#3d7fb8", "#e3b94a", "#c74b3b"],
    art: "European clear-line album art. Uniform crisp outlines of equal weight with no hatching and no spotted blacks, simplified cartoon faces on carefully observed realistic backgrounds, vehicles and architecture. Flat even colour with no shading, soft natural palette.",
    print: "Offset printing on thick matte album paper, clean edges, gentle colour.",
    lettering: "Neat hand-lettered upper case in rectangular balloons with rounded corners, yellow rectangular caption boxes, small tidy sound effects.",
    cover: "Hardcover album cover: a series banner across the top with the title in rounded letters, the imprint name in small type, and one large framed adventure scene beneath it.",
    back: "An album back cover: a grid of small thumbnail covers of other fictional volumes in the same series on a plain colour field.",
  },
  {
    id: "riso",
    name: "Indie zine",
    years: "risograph",
    blurb: "Scratchy pens, two grainy riso inks, photocopy charm.",
    swatch: ["#ff48b0", "#0078bf", "#f7f1e3"],
    art: "Indie small-press comic art. Loose scratchy pen drawing with wobbly panel borders drawn by hand, awkward charming figures, diary-like observation. Two risograph inks only, fluorescent pink and medium blue, overlapping to make purple, with grainy uneven coverage.",
    print: "Risograph on uncoated cream paper: grainy ink, visible roller marks, colours slightly out of register, soft edges.",
    lettering: "Uneven hand-written lettering in mixed case, lumpy hand-drawn balloons, notes and arrows scribbled in the margins.",
    cover: "Self-published zine cover: a hand-drawn title in wonky letters, 'no. 1' and a price of '$5' scribbled in a corner, the imprint name hand-written at the bottom, and one simple drawing in two riso inks.",
    back: "A zine back cover: a small hand-drawn doodle from the story with a hand-written thank-you note and a hand-drawn stamp reading the imprint name.",
  },
  {
    id: "glossy-retro",
    name: "Glossy Retro",
    years: "retro revival",
    blurb: "Glossy saturated covers with warm light, deep blue shadow and heavy halftone.",
    swatch: ["#f08a24", "#1d4e89", "#f2e3b3"],
    art: "Glossy retro-styled digital comic art. Semi-realistic faces drawn with bold black outlines and dense hatching, rich saturated colour with warm orange light against deep blue shadow, heavy vintage halftone texture laid over smooth shading.",
    print: "A lightly worn vintage comic: soft paper grain, fine halftone dots, slightly rubbed edges.",
    lettering: "Bold upper-case comic lettering in white balloons with thick outlines, yellow caption boxes, big outlined sound effects.",
    cover: "Retro cover trade dress: a very large bold masthead title with a thick outline and drop shadow across the top, a banner strip reading the imprint name, an issue number box at top left, a small price at top right and a barcode box at the bottom corner.",
    back: "A retro back cover: a pin-up of the main character with a bold 'NEXT ISSUE' headline and a short teaser line.",
  },
];

export const DEFAULT_ERA = "newsstand";

export function getEra(id: string | undefined): Era {
  return ERAS.find((e) => e.id === id) ?? ERAS[0];
}
