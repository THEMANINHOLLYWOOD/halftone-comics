// Shared between the server pipeline and the client studio.

export type PageKind = "cover" | "page" | "back";
export type PageStatus = "pending" | "ready" | "failed";

/** One drawn sheet at the sizes the studio needs. */
export interface PageUrls {
  /** The image as drawn, for saving. */
  full: string;
  w1280: string;
  w640: string;
  w320: string;
}

export interface ComicPage {
  id: string;
  kind: PageKind;
  status: PageStatus;
  /** Bumped every time the page is redrawn; part of every file name. */
  rev?: number;
  urls?: PageUrls;
  caption?: string;
  error?: string;
  /** Failed attempts at drawing this sheet in the current run. */
  attempts?: number;
  /** The image model (artist) that drew the current image. */
  artist?: string;
  /** Draw it next time with this artist instead of the comic's own. */
  drawWith?: string;
  /** A change someone asked for, with marks on the page (fractions) pointing at it. */
  edit?: { prompt: string; marks: [number, number][][] };
}

export type SourceKind = "image" | "video" | "audio" | "document" | "text" | "link" | "file" | "import";

export interface ComicSource {
  kind: SourceKind;
  name: string;
  note?: string;
}

export interface ScriptLine {
  speaker: string;
  text: string;
}

export interface ScriptPanel {
  shot: string;
  action: string;
  dialogue: ScriptLine[];
  caption?: string;
  sfx?: string;
  /** Seconds into the source video this panel is drawn from, when there is one. */
  timestamp?: number;
}

export interface ScriptPage {
  summary: string;
  panels: ScriptPanel[];
}

export interface ScriptCharacter {
  name: string;
  look: string;
  /** Seconds into the source video where this character is seen most clearly. */
  timestamp?: number;
}

export interface ComicScript {
  title: string;
  tagline: string;
  logline: string;
  setting: string;
  characters: ScriptCharacter[];
  cover: { concept: string; blurb: string };
  pages: ScriptPage[];
  back: { concept: string };
}

export interface ComicRef {
  /** Storage path, under the comic's private folder. */
  file: string;
  label: string;
  /** likeness: who someone is. scene: what one moment looked like. */
  role: "likeness" | "scene";
  /** Script page (1-based) a scene still belongs to. */
  page?: number;
}

export type ComicStatus = "generating" | "ready" | "failed";

/** The wide image a comic's share link shows, painted after its cover. */
export interface ShareImage {
  status: PageStatus;
  url?: string;
  rev?: number;
  artist?: string;
  attempts?: number;
  error?: string;
}
export type Quality = "standard" | "best";

/** The public record of a comic: everything the shelf and reader need. */
export interface Comic {
  id: string;
  title: string;
  issue?: number;
  tagline?: string;
  era: string;
  collection: "new" | "classic";
  /** Classics keep the order they had on the old site. */
  order?: number;
  createdAt: string;
  status: ComicStatus;
  /** Human-readable line about what the pipeline is doing right now. */
  progress?: string;
  error?: string;
  prompt?: string;
  /** Older comics only: replaced by `artist`. */
  quality?: Quality;
  /** The image model sheets are drawn with unless a redraw picks another. */
  artist?: string;
  sources?: ComicSource[];
  pages: ComicPage[];
  /** Comics made before share images existed have none. */
  share?: ShareImage;
  script?: ComicScript;
  /** Set on listings: the comic has a saved script, so sheets can be drawn again. */
  canRedraw?: boolean;
}

/** A file the studio received, as the client hands it to /api/generate. */
export interface UploadRef {
  /** Blob URL on Vercel, `uploads/<id>` locally. */
  ref: string;
  name: string;
  mime: string;
  size: number;
}

export interface GenerateRequest {
  prompt: string;
  /** A title the maker typed; used exactly as written. */
  title?: string;
  era: string;
  /** 0 means "let the story decide". */
  pages: number;
  /** Image model id, see lib/artists.ts. */
  artist: string;
  uploads: UploadRef[];
  links: string[];
}

export interface StudioInfo {
  hasKey: boolean;
  hasFfmpeg: boolean;
  /** Where uploads go: straight to Vercel Blob, or to this server. */
  storage: "blob" | "local";
  /** Removing comics needs the studio passcode (making and redrawing do not). */
  locked: boolean;
  /** Which of the artists' own-key routes this server has. */
  keys: { openai: boolean; gemini: boolean };
}
