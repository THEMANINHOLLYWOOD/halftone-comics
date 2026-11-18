// What someone handed the studio, read safely from a request body. Shared by
// making a comic and adding pages to one.

import { DEFAULT_ARTIST, MODEL_ID } from "./artists";
import { ERAS } from "./eras";
import { cleanTitle } from "./prompts";
import { isUploadRef } from "./storage";
import type { GenerateRequest, UploadRef } from "./types";

export function readMaterial(raw: unknown, options: { admin?: boolean } = {}): GenerateRequest {
  const body = (raw && typeof raw === "object" ? raw : {}) as Partial<GenerateRequest>;
  const strings = (value: unknown, limit: number) =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").slice(0, limit) : [];
  const uploads = (Array.isArray(body.uploads) ? body.uploads : [])
    .filter((u): u is UploadRef => !!u && typeof u.ref === "string" && isUploadRef(u.ref) && typeof u.name === "string")
    .slice(0, 12)
    .map((u) => ({
      ref: u.ref,
      name: u.name.slice(0, 200),
      mime: typeof u.mime === "string" ? u.mime : "",
      size: Number(u.size) || 0,
    }));
  return {
    prompt: typeof body.prompt === "string" ? body.prompt.slice(0, 6000) : "",
    title: cleanTitle(body.title),
    era: ERAS.some((era) => era.id === body.era) ? (body.era as string) : ERAS[0].id,
    pages: Math.min(Math.max(Math.round(Number(body.pages) || 0), 0), 12),
    artist: options.admin && typeof body.artist === "string" && MODEL_ID.test(body.artist) ? body.artist : DEFAULT_ARTIST,
    uploads,
    links: strings(body.links, 6),
  };
}

export function hasMaterial(m: GenerateRequest): boolean {
  return !!m.prompt.trim() || !!m.title || m.uploads.length > 0 || m.links.length > 0;
}
