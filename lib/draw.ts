// Drawing one sheet with whichever artist (image model) was chosen.
//
// A model can be reached more than one way. Each is tried in order:
//   openai   OpenAI directly, with OPENAI_API_KEY (bills your OpenAI account)
//   gemini   Gemini directly, with GEMINI_API_KEY (bills your Google account)
//   gateway  Vercel AI Gateway, authenticated by the deployment (bills AI
//            Gateway credits; most models need paid credits)
// A route is skipped only when it is refused for access or billing reasons;
// any other failure is reported as is, so the pipeline can retry it.

import { createOpenAI } from "@ai-sdk/openai";
import { generateImage, generateText } from "ai";
import { artistRoutes, getArtist, type Artist, type ArtistRoute } from "./artists";
import { apiKey, generateImage as geminiImage, image as geminiImagePart, text as geminiText } from "./gemini";

export interface Reference {
  label: string;
  data: Buffer;
}

export interface Drawn {
  data: Buffer;
  mime: string;
  artist: string;
  route: ArtistRoute;
}

export function serverKeys() {
  return { openai: !!process.env.OPENAI_API_KEY, gemini: !!apiKey() };
}

export type Aspect = "portrait" | "landscape";
const SIZES: Record<Aspect, `${number}x${number}`> = { portrait: "1024x1536", landscape: "1536x1024" };
const RATIOS: Record<Aspect, `${number}:${number}`> = { portrait: "2:3", landscape: "3:2" };

/** Refused for who is asking rather than what was asked: another route may still work. */
function isAccessError(error: unknown): boolean {
  const e = error as { status?: number; statusCode?: number; message?: string };
  const status = Number(e?.statusCode ?? e?.status ?? 0);
  const message = String(e?.message ?? "");
  if (status === 401 || status === 402 || status === 403) return true;
  if (status === 429 && /limit:\s*0\b/i.test(message)) return true;
  return /free tier users|paid credits|insufficient (funds|credits|quota)|billing/i.test(message);
}

/**
 * Worth one more try without the reference images: the model would not take
 * them, or its safety filter objected (photos of real people and stills of
 * other comics are the usual trigger, not the prompt).
 */
function isReferenceError(error: unknown): boolean {
  const e = error as { status?: number; statusCode?: number; message?: string };
  const status = Number(e?.statusCode ?? e?.status ?? 0);
  const message = String(e?.message ?? "");
  if (/safety system|moderation|content policy|safety_violations|rejected/i.test(message)) return true;
  return status === 400 && /image|edit|input|reference|mask|unsupported|not support/i.test(message);
}

export function isSafetyRefusal(error: unknown): boolean {
  return /safety system|moderation|content policy|safety_violations/i.test(String((error as Error)?.message ?? ""));
}

function referenceIntro(refs: Reference[]): string {
  if (!refs.length) return "";
  const list = refs.map((ref, i) => `${i + 1}. ${ref.label}`).join("\n");
  return `Reference images are attached, in this order:\n${list}\n\n`;
}

function fit(prompt: string, artist: Artist): string {
  if (!artist.maxPrompt || prompt.length <= artist.maxPrompt) return prompt;
  return `${prompt.slice(0, artist.maxPrompt - 1)}…`;
}

let openaiClient: ReturnType<typeof createOpenAI> | null = null;
function openai() {
  openaiClient ??= createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

async function viaOpenAI(artist: Artist, prompt: string, refs: Reference[], signal: AbortSignal, aspect: Aspect) {
  const model = artist.id.split("/")[1];
  const result = await generateImage({
    model: openai().image(model),
    prompt: refs.length ? { text: prompt, images: refs.map((r) => r.data) } : prompt,
    size: SIZES[aspect],
    // Comics are full of fights, flames and monsters; "low" is OpenAI's
    // documented setting for less restrictive filtering of that.
    providerOptions: { openai: { moderation: "low" } },
    maxRetries: 0,
    abortSignal: signal,
  });
  return { data: Buffer.from(result.image.uint8Array), mime: result.image.mediaType || "image/png" };
}

async function viaGemini(artist: Artist, prompt: string, refs: Reference[], deadline: number, aspect: Aspect) {
  const parts = refs.flatMap((ref) => [geminiText(`${ref.label}:`), geminiImagePart(ref.data)]);
  return geminiImage({ parts: [...parts, geminiText(prompt)], model: artist.id.split("/")[1], deadline, aspect: RATIOS[aspect] });
}

async function viaGateway(artist: Artist, prompt: string, refs: Reference[], signal: AbortSignal, aspect: Aspect) {
  if (artist.api === "text") {
    const result = await generateText({
      model: artist.id,
      messages: [
        {
          role: "user",
          content: [
            ...refs.map((ref) => ({ type: "file" as const, mediaType: "image/jpeg", data: ref.data })),
            { type: "text" as const, text: prompt },
          ],
        },
      ],
      providerOptions: { google: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: RATIOS[aspect] } } },
      maxRetries: 0,
      abortSignal: signal,
    });
    const file = result.files.find((f) => f.mediaType?.startsWith("image/"));
    if (!file) {
      const said = result.text?.trim();
      throw new Error(said ? `The model answered in words instead: ${said.slice(0, 200)}` : "The model returned no image.");
    }
    return { data: Buffer.from(file.uint8Array), mime: file.mediaType };
  }
  const result = await generateImage({
    model: artist.id,
    prompt: refs.length ? { text: prompt, images: refs.map((r) => r.data) } : prompt,
    ...(artist.sizing === "size" ? { size: SIZES[aspect] } : { aspectRatio: RATIOS[aspect] }),
    maxRetries: 0,
    abortSignal: signal,
  });
  return { data: Buffer.from(result.image.uint8Array), mime: result.image.mediaType || "image/png" };
}

/** Draw one sheet. Throws the most useful error if no route could. */
export async function drawWith(
  artistId: string,
  options: { prompt: string; refs: Reference[]; deadline: number; aspect?: Aspect },
): Promise<Drawn> {
  const artist = getArtist(artistId);
  const routes = artistRoutes(artist, serverKeys());
  let refs = options.refs.slice(0, artist.refs);
  const aspect = options.aspect ?? "portrait";
  const failures: unknown[] = [];

  for (const route of routes) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const left = options.deadline - Date.now();
      if (left < 20_000) throw Object.assign(new Error("Ran out of time before drawing."), { name: "TimeoutError" });
      const prompt = fit(referenceIntro(refs) + options.prompt, artist);
      const signal = AbortSignal.timeout(left);
      try {
        const drawn =
          route === "openai"
            ? await viaOpenAI(artist, prompt, refs, signal, aspect)
            : route === "gemini"
              ? await viaGemini(artist, prompt, refs, options.deadline, aspect)
              : await viaGateway(artist, prompt, refs, signal, aspect);
        return { ...drawn, artist: artist.id, route };
      } catch (error) {
        if ((error as Error)?.name === "AbortError" || (error as Error)?.name === "TimeoutError") {
          throw Object.assign(new Error(`${artist.name} took too long.`), { name: "TimeoutError" });
        }
        if (attempt === 0 && refs.length && isReferenceError(error)) {
          refs = [];
          continue;
        }
        failures.push(error);
        if (isAccessError(error)) break;
        if (isSafetyRefusal(error)) {
          const refused = new Error(
            `${artist.name}'s safety filter refused this sheet, even without reference images. Redraw it with another artist.`,
          );
          throw refused;
        }
        throw error;
      }
    }
  }
  throw routeFailure(artist, routes, failures);
}

function routeFailure(artist: Artist, routes: ArtistRoute[], failures: unknown[]): Error {
  const last = failures[failures.length - 1] as Error | undefined;
  const message = String(last?.message ?? "");
  const needsCredits = /free tier users|paid credits/i.test(message);
  const tried = routes.length > 1 ? " (tried your own key first)" : "";
  const error = new Error(
    needsCredits
      ? `${artist.name} needs paid Vercel AI Gateway credits${tried}. Add credits under AI Gateway in your Vercel dashboard, or pick an OpenAI artist, which uses your OpenAI key.`
      : isSafetyRefusal(last)
        ? `${artist.name}'s safety filter refused this sheet, even without reference images. Redraw it with another artist.`
        : `${artist.name} could not draw this sheet: ${message.slice(0, 220)}`,
  );
  // Nothing about this will change by waiting.
  error.name = "ArtistUnavailableError";
  return error;
}
