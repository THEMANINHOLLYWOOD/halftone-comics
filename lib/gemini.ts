// Thin wrapper over the Gemini Interactions API: one call shape for "read
// these things and answer in JSON" and one for "draw this".
//
// Everything model-specific lives here, so pointing the studio at another
// image model means replacing `generateImage` and nothing else.

import { GoogleGenAI } from "@google/genai";

export type Part =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mime_type: string }
  | { type: "video"; uri: string; mime_type?: string }
  | { type: "audio"; uri: string; mime_type: string }
  | { type: "document"; data?: string; uri?: string; mime_type: string };

export const text = (value: string): Part => ({ type: "text", text: value });
export const image = (data: Buffer, mime = "image/jpeg"): Part => ({
  type: "image",
  data: data.toString("base64"),
  mime_type: mime,
});

export function apiKey(): string {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
}

export const MODELS = {
  /**
   * Read the sources (video included) and write the script. Tried in order:
   * each model has its own rate limits, so one being busy does not stop a comic.
   */
  text: (process.env.GEMINI_TEXT_MODEL || "gemini-4-hydrogen,gemini-3.6-flash,gemini-3.5-flash-lite")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean),
  imageSize: process.env.COMIC_IMAGE_SIZE || "2K",
};

let client: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  const key = apiKey();
  if (!key) throw new Error("GEMINI_API_KEY is not set. Add it to .env.local and restart.");
  client ??= new GoogleGenAI({ apiKey: key });
  return client;
}

function statusOf(error: unknown): number {
  const e = error as { status?: number; statusCode?: number; code?: number };
  return Number(e?.status ?? e?.statusCode ?? e?.code ?? 0);
}

/**
 * A 429 that waiting will not fix: the key's plan has no allowance at all for
 * this model ("limit: 0"). Google's free tier does this for image models.
 */
export function isBillingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return statusOf(error) === 429 && /limit:\s*0\b/i.test(message);
}

export const BILLING_MESSAGE =
  "This Gemini key is on the free tier, which cannot draw images (Google sets that limit to 0). Turn on billing for the key in Google AI Studio, then use Draw missing sheets.";

function modelIn(message: string): string | null {
  return message.match(/for model\s+([\w.-]+)/i)?.[1] ?? null;
}

export function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const status = statusOf(error);
  if (isBillingError(error)) {
    const model = modelIn(message);
    if (!model || /image|banana/i.test(model)) return BILLING_MESSAGE;
    return `This Gemini key's plan has no allowance for ${model}. Turn on billing for the key in Google AI Studio, or set GEMINI_TEXT_MODEL to a model it can use.`;
  }
  if (status === 401 || status === 403 || /api key/i.test(message)) {
    return "Gemini rejected the API key. Check GEMINI_API_KEY.";
  }
  if (status === 429) {
    const model = modelIn(message);
    return `Gemini's rate limit${model ? ` for ${model}` : ""} was reached${/free tier/i.test(message) ? " (free tier)" : ""}. Wait a minute and try again.`;
  }
  if (status === 503) return "Gemini is overloaded right now. Wait a minute and try again.";
  if (status === 404) return `Gemini does not know that model. ${message}`;
  return message.length > 300 ? `${message.slice(0, 300)}…` : message;
}

/** Worth trying again later: rate limits, server hiccups, timeouts. */
export function isTransient(error: unknown): boolean {
  if (isBillingError(error)) return false;
  const status = statusOf(error);
  const name = (error as Error)?.name;
  const message = (error as Error)?.message ?? "";
  // "fetch failed" and socket resets are the network, not the request.
  const network = /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network/i.test(message);
  return status === 429 || status >= 500 || network || name === "RetryableError" || name === "TimeoutError";
}

class TimeoutError extends Error {
  name = "TimeoutError";
}

function withTimeout<T>(label: string, work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`${label} took longer than ${Math.round(ms / 1000)}s.`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Run `call`, retrying transient failures while there is time left before
 * `deadline` (a server function only lives so long).
 */
async function withRetry<T>(label: string, deadline: number, call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const left = deadline - Date.now();
    if (left < 15_000) throw new TimeoutError(`${label} ran out of time.`);
    try {
      return await withTimeout(label, call(), left);
    } catch (error) {
      // Rate limits are per minute: retrying a second later only burns another request.
      const wait = (statusOf(error) === 429 ? [20_000, 40_000] : [2000, 6000])[attempt];
      if (!isTransient(error) || wait === undefined || deadline - Date.now() < wait + 30_000) throw error;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

/**
 * The stable API takes a turn as a `user_input` step; a bare list of mixed
 * parts (labels between images, text after a video) is only accepted on v1beta.
 */
function asInput(parts: Part[]) {
  return [{ type: "user_input" as const, content: parts }];
}

class RetryableError extends Error {
  name = "RetryableError";
}

export async function generateJson<T>(options: {
  parts: Part[];
  system: string;
  schema: Record<string, unknown>;
  deadline: number;
}): Promise<T> {
  let lastError: unknown;
  for (const [index, model] of MODELS.text.entries()) {
    const last = index === MODELS.text.length - 1;
    try {
      // Rate limits are per model, so on a 429 go straight to the next model
      // instead of waiting out this one (unless it is the last).
      const call = async () => {
        const interaction = await gemini().interactions.create({
          model,
          input: asInput(options.parts),
          system_instruction: options.system,
          response_format: { type: "text", mime_type: "application/json", schema: options.schema },
          // Sources can be personal photos and videos; do not keep them server-side.
          store: false,
        });
        const raw = interaction.output_text;
        if (!raw) {
          throw new Error(`The script model returned nothing (status: ${interaction.status ?? "unknown"}).`);
        }
        try {
          return JSON.parse(raw) as T;
        } catch {
          throw new RetryableError("The script came back as malformed JSON.");
        }
      };
      return last ? await withRetry("Writing the script", options.deadline, call) : await withTimeout("Writing the script", call(), Math.max(options.deadline - Date.now(), 1000));
    } catch (error) {
      lastError = error;
      const status = statusOf(error);
      const tryNext = status === 429 || status === 404 || status === 503 || isBillingError(error);
      if (last || !tryNext || options.deadline - Date.now() < 45_000) throw error;
    }
  }
  throw lastError;
}

/** One attempt at drawing with a Gemini image model, using this server's Gemini key. */
export async function generateImage(options: {
  parts: Part[];
  model: string;
  deadline: number;
  aspect?: string;
}): Promise<{ data: Buffer; mime: string }> {
  const left = options.deadline - Date.now();
  if (left < 20_000) throw new TimeoutError("Ran out of time before drawing.");
  return withTimeout(
    "Drawing",
    (async () => {
      const interaction = await gemini().interactions.create({
        model: options.model,
        input: asInput(options.parts),
        response_format: {
          type: "image",
          aspect_ratio: options.aspect ?? "2:3",
          image_size: MODELS.imageSize,
        },
        store: false,
      });
      const out = interaction.output_image;
      if (!out?.data) {
        // The model answered in words instead of a picture: usually a refusal.
        const said = interaction.output_text?.trim();
        throw new Error(
          said
            ? `The image model declined: ${said.slice(0, 220)}`
            : `The image model returned no image (status: ${interaction.status ?? "unknown"}).`,
        );
      }
      return { data: Buffer.from(out.data, "base64"), mime: out.mime_type || "image/png" };
    })(),
    left,
  );
}

export interface RemoteFile {
  name: string;
  uri: string;
  mime: string;
  state: "PROCESSING" | "ACTIVE" | "FAILED";
}

function remote(file: { name?: string; uri?: string; mimeType?: string; state?: string }, mime: string): RemoteFile {
  const state = file.state === "ACTIVE" || file.state === "FAILED" ? file.state : "PROCESSING";
  return { name: file.name ?? "", uri: file.uri ?? "", mime: file.mimeType || mime, state };
}

/** Hand a large file (video, audio, document) to Gemini. It is usable once `checkFile` says ACTIVE. */
export async function uploadFile(filePath: string, mime: string): Promise<RemoteFile> {
  const uploaded = await gemini().files.upload({ file: filePath, config: { mimeType: mime } });
  if (!uploaded.name) throw new Error("Gemini did not accept the upload.");
  return remote(uploaded, mime);
}

export async function checkFile(name: string, mime: string): Promise<RemoteFile> {
  return remote(await gemini().files.get({ name }), mime);
}

export async function deleteFile(name: string): Promise<void> {
  try {
    await gemini().files.delete({ name });
  } catch {
    // Uploaded files expire on their own after two days; nothing to do.
  }
}
