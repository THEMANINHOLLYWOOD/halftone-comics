// The image models a comic can be drawn with ("artists"). Shared by the
// server and the studio, so no secrets here.
//
// Ids are AI Gateway model ids ("maker/model"). Which route a drawing takes
// (your own OpenAI or Gemini key, or Vercel AI Gateway credits) is decided
// on the server; see lib/draw.ts. Prices are rough per-sheet figures from the
// gateway's live price list in November 2026, for comparing, not billing.

export type ArtistRoute = "openai" | "gemini" | "gateway";

export interface Artist {
  id: string;
  name: string;
  maker: string;
  /** What it is good at, in comic terms. */
  note: string;
  /** Rough cost of one 2:3 sheet. */
  price: string;
  /** Most reference images to send (cover, likenesses, scene stills). 0 = text only. */
  refs: number;
  /** "text": a multimodal model that returns images from a chat call. */
  api: "image" | "text";
  /** Some models take an exact size, the rest an aspect ratio. */
  sizing: "size" | "aspect";
  /** Longest prompt the model accepts, when it is short. */
  maxPrompt?: number;
  /** Shown first in the picker. */
  featured?: boolean;
}

export const ARTISTS: Artist[] = [
  {
    id: "openai/gpt-image-2.6-sunburst",
    name: "GPT Image 2.6 Sunburst",
    maker: "OpenAI",
    note: "Cleanest lettering and the most faithful to long panel scripts.",
    price: "~$0.05–0.20",
    refs: 8,
    api: "image",
    sizing: "size",
    featured: true,
  },
  {
    id: "google/gemini-nano-banana-2.1",
    name: "Nano Banana 2.1",
    maker: "Google",
    note: "Fast, keeps faces and outfits consistent from reference photos.",
    price: "~$0.05",
    refs: 8,
    api: "text",
    sizing: "aspect",
    featured: true,
  },
  {
    id: "bfl/flux-3-image",
    name: "FLUX 3",
    maker: "Black Forest Labs",
    note: "Rich, painterly illustration; takes up to 10 references.",
    price: "~$0.07",
    refs: 8,
    api: "image",
    sizing: "aspect",
    featured: true,
  },
  {
    id: "google/gemini-3-pro-image",
    name: "Nano Banana Pro",
    maker: "Google",
    note: "Most detailed Google model; slower and pricier.",
    price: "~$0.13",
    refs: 8,
    api: "text",
    sizing: "aspect",
    featured: true,
  },
  {
    id: "openai/gpt-image-2.6-flare",
    name: "GPT Image 2.6 Flare",
    maker: "OpenAI",
    note: "The quicker OpenAI model, good for drafts and redraws.",
    price: "~$0.05–0.20",
    refs: 8,
    api: "image",
    sizing: "size",
  },
  {
    id: "bytedance/seedream-5.0-pro",
    name: "Seedream 5.0 Pro",
    maker: "ByteDance",
    note: "Vivid colour and crisp linework; strong at editing from references.",
    price: "~$0.04",
    refs: 6,
    api: "image",
    sizing: "aspect",
  },
  {
    id: "minimax/minimax-h3-image",
    name: "MiniMax H3",
    maker: "MiniMax",
    note: "Handles many references at once (up to 16).",
    price: "varies",
    refs: 8,
    api: "image",
    sizing: "aspect",
  },
  {
    id: "microsoft/mai-image-2.6",
    name: "MAI-Image 2.6",
    maker: "Microsoft",
    note: "Clean, controllable generation and editing.",
    price: "varies",
    refs: 2,
    api: "image",
    sizing: "aspect",
  },
  {
    id: "spacexai/grok-imagine-image-2.0",
    name: "Grok Imagine 2.0",
    maker: "SpaceXAI",
    note: "Bold, high-contrast images; one reference at most.",
    price: "~$0.06",
    refs: 1,
    api: "image",
    sizing: "aspect",
  },
  {
    id: "meta/muse-image-1.0",
    name: "Muse Image",
    maker: "Meta",
    note: "Very cheap; blends photos of people into the scene.",
    price: "~$0.01",
    refs: 4,
    api: "image",
    sizing: "aspect",
  },
  {
    id: "recraft/recraft-v4.1",
    name: "Recraft V4.1",
    maker: "Recraft",
    note: "Graphic, poster-like illustration. Short prompts only, so best for covers.",
    price: "~$0.04",
    refs: 0,
    api: "image",
    sizing: "aspect",
    maxPrompt: 1000,
  },
  {
    id: "bfl/flux-3-image-klein",
    name: "FLUX 3 Klein",
    maker: "Black Forest Labs",
    note: "Cheapest decent option, for thumbnails and layout tests.",
    price: "~$0.01",
    refs: 0,
    api: "image",
    sizing: "aspect",
  },
];

export const DEFAULT_ARTIST = ARTISTS[0].id;

/** Any AI Gateway image model id ("maker/model") can be tried, curated or not. */
export const MODEL_ID = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9.-]*$/;

export function getArtist(id: string | undefined): Artist {
  const known = ARTISTS.find((a) => a.id === id);
  if (known) return known;
  if (id && MODEL_ID.test(id)) {
    const [maker, model] = id.split("/");
    // An uncurated model: assume the safest settings and let it be tried.
    return {
      id,
      name: model,
      maker,
      note: "Custom model from the AI Gateway list.",
      price: "see AI Gateway",
      refs: maker === "openai" || maker === "google" ? 4 : 0,
      api: maker === "google" ? "text" : "image",
      sizing: maker === "openai" ? "size" : "aspect",
    };
  }
  return ARTISTS[0];
}

/** Which routes could draw with this artist, given the keys the server has. */
export function artistRoutes(artist: Artist, keys: { openai: boolean; gemini: boolean }): ArtistRoute[] {
  const maker = artist.id.split("/")[0];
  const routes: ArtistRoute[] = [];
  if (maker === "openai" && keys.openai) routes.push("openai");
  if (maker === "google" && keys.gemini) routes.push("gemini");
  routes.push("gateway");
  return routes;
}

export const ROUTE_LABEL: Record<ArtistRoute, string> = {
  openai: "your OpenAI key",
  gemini: "your Gemini key",
  gateway: "AI Gateway credits",
};
