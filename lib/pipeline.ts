// Making a comic, as a chain of short background steps:
//
//   ingest   read every upload and link (videos go to Gemini to be watched)
//   script   write the whole book as structured JSON
//   stills   pull reference frames out of the video
//   draw     the cover first, then the other sheets a few at a time
//   done     tidy up
//
// A server function only lives a few minutes, so a run does steps until its
// time is nearly up, then hands the rest to a fresh run (POST /api/work).
// Progress lives in two records: the comic's public manifest, and a private
// job record holding sources and reference stills.

import { randomUUID } from "node:crypto";
import { privateFolder, workerKey } from "./auth";
import { getEra } from "./eras";
import { artistRoutes, DEFAULT_ARTIST, getArtist } from "./artists";
import { drawWith, serverKeys, type Reference } from "./draw";
import {
  BILLING_MESSAGE,
  deleteFile,
  describeError,
  generateJson,
  image,
  isBillingError,
  isTransient,
  text,
  type Part,
} from "./gemini";
import {
  createComic,
  getComic,
  nextIssueNumber,
  privatePath,
  saveShareImage,
  saveSheet,
  shareFile,
  sheetFiles,
  uniqueComicId,
  updateComic,
} from "./library";
import {
  backPrompt,
  continuationRequest,
  coverPrompt,
  editPrompt,
  pagePrompt,
  pageRange,
  referenceNote,
  scriptRequest,
  scriptSchema,
  scriptSystem,
  sharePrompt,
} from "./prompts";
import { marksSvg } from "./marks";
import { ingest, newIngest, toJpeg, type IngestState, type JobSource } from "./sources";
import { downloadToTemp, readBytes, readJson, removePaths, uploadPath, writeBytes, writeJson } from "./storage";
import type { Comic, ComicPage, ComicRef, ComicScript, GenerateRequest, ScriptCharacter, ScriptPage, UploadRef } from "./types";
import { grabFrame, hasFfmpeg } from "./video";

type Step = "ingest" | "script" | "stills" | "draw" | "done";

interface Job {
  /** Only the run holding this token may work on the job. */
  token: string;
  /** Last sign of life, ms since epoch. A silent job is treated as interrupted. */
  heartbeat: number;
  /** Where to reach this app to hand work on. */
  origin: string;
  step: Step;
  request: { prompt: string; title?: string; era: string; pages: number; artist: string; single?: boolean };
  ingest: IngestState;
  refs: ComicRef[];
  /** Set when adding pages to a finished comic: how many story pages it already had. */
  extendFrom?: number;
}

/** Time a single background run may use; Vercel stops functions at 300s. */
const RUN_BUDGET_MS = 270_000;
/** Do not start a step this late into a run: hand it to a fresh one instead. */
const START_BY_MS: Record<Step, number> = {
  ingest: 120_000,
  script: 40_000,
  stills: 150_000,
  draw: 100_000,
  done: 250_000,
};
/** A job that has not checked in for this long was cut off. */
const STALE_MS = 7 * 60_000;
const DRAW_BATCH = 3;
const MAX_ATTEMPTS = 3;

const pad = (n: number) => String(n).padStart(2, "0");
const jobPath = (id: string) => `${privateFolder(id)}/job.json`;

async function readJob(id: string): Promise<Job | null> {
  return (await readJson<Job>(jobPath(id)))?.data ?? null;
}

async function saveJob(id: string, job: Job): Promise<void> {
  job.heartbeat = Date.now();
  await writeJson(jobPath(id), job);
}

const setProgress = (id: string, line: string) =>
  updateComic(id, (c) => void (c.progress = line)).then(() => undefined);

// ---- starting ------------------------------------------------------------

/** One photo and nothing else: a front and back cover, ready fast, that can grow into a book later. */
export function isSingle(request: GenerateRequest): boolean {
  return (
    request.uploads.length === 1 &&
    request.uploads[0].mime.startsWith("image/") &&
    !request.prompt.trim() &&
    request.links.length === 0 &&
    request.pages === 0
  );
}

/** New story pages, numbered on from the last one, placed before the back cover. */
export function appendPages(pages: ComicPage[], summaries: string[]): ComicPage[] {
  const story = pages.filter((p) => p.kind === "page");
  const last = story.reduce((n, p) => Math.max(n, Number(p.id.split("-")[1]) || 0), 0);
  const fresh = summaries.map(
    (summary, i): ComicPage => ({ id: `page-${pad(last + i + 1)}`, kind: "page", status: "pending", caption: summary }),
  );
  const back = pages.findIndex((p) => p.kind === "back");
  return back < 0 ? [...pages, ...fresh] : [...pages.slice(0, back), ...fresh, ...pages.slice(back)];
}

export async function startComic(request: GenerateRequest, origin: string): Promise<{ comic: Comic; token: string }> {
  const era = getEra(request.era);
  const single = isSingle(request);
  const seed = request.title ?? (request.prompt.trim().split(/\s+/).slice(0, 6).join(" ") || "new comic");
  const id = await uniqueComicId(seed);
  const planned = single ? 0 : request.pages > 0 ? request.pages : 4;

  const comic = await createComic({
    id,
    title: request.title ?? "Untitled",
    issue: await nextIssueNumber(),
    era: era.id,
    collection: "new",
    createdAt: new Date().toISOString(),
    status: "generating",
    progress: "Reading what you dropped in…",
    prompt: request.prompt.trim() || undefined,
    artist: request.artist,
    share: { status: "pending" },
    pages: [
      { id: "cover", kind: "cover", status: "pending" },
      ...Array.from({ length: planned }, (_, i): ComicPage => ({
        id: `page-${pad(i + 1)}`,
        kind: "page",
        status: "pending",
      })),
      { id: "back", kind: "back", status: "pending" },
    ],
  });

  const token = randomUUID();
  await saveJob(id, {
    token,
    heartbeat: Date.now(),
    origin,
    step: "ingest",
    request: { prompt: request.prompt, title: request.title, era: era.id, pages: request.pages, artist: request.artist, single },
    ingest: newIngest(request.uploads, request.links),
    refs: [],
  });
  return { comic, token };
}

/** Put pages back in the queue and start a run that draws them. */
async function restartDrawing(
  id: string,
  origin: string,
  pick: (page: ComicPage) => boolean,
  artist?: string,
  change?: ComicPage["edit"],
): Promise<{ comic: Comic; token: string }> {
  const job = await readJob(id);
  if (!job) throw new Error("This comic has no saved job to draw from.");
  if (job.token && Date.now() - job.heartbeat < STALE_MS) throw new Error("This comic is still being drawn.");

  const comic = await updateComic(id, (c) => {
    if (!c.script) throw new Error("This comic has no script to draw from.");
    for (const page of c.pages) {
      // A new cover means a new poster to match it.
      if (pick(page) && page.kind === "cover") c.share = { ...c.share, status: "pending", attempts: 0, error: undefined };
      if (pick(page)) {
        page.status = "pending";
        page.error = undefined;
        page.attempts = 0;
        page.drawWith = artist;
        page.edit = change;
      }
    }
    c.status = "generating";
    c.error = undefined;
    c.progress = "Drawing…";
  });

  job.token = randomUUID();
  job.origin = origin;
  job.step = "draw";
  await saveJob(id, job);
  return { comic, token: job.token };
}

export async function redrawPage(id: string, pageId: string, origin: string, artist?: string, change?: ComicPage["edit"]) {
  const comic = await getComic(id);
  if (comic.collection !== "new") throw new Error("This comic cannot be redrawn.");
  const page = comic.pages.find((p) => p.id === pageId);
  if (!page) throw new Error("Unknown page.");
  // A change is made to the page as it is; with nothing drawn yet it is a plain redraw with a note.
  return restartDrawing(id, origin, (p) => p.id === pageId, artist, change);
}

export async function redrawFailed(id: string, origin: string, artist?: string) {
  const comic = await getComic(id);
  if (!comic.pages.some((p) => p.status === "failed")) throw new Error("Every sheet of this comic is already drawn.");
  return restartDrawing(id, origin, (page) => page.status === "failed", artist);
}

/** True while a run is (or should be) working on this comic. */
export async function isActive(id: string): Promise<boolean> {
  const job = await readJob(id);
  return !!job?.token && Date.now() - job.heartbeat < STALE_MS;
}

/**
 * A comic left "generating" with no live run behind it was cut off. Close it
 * out so its finished pages are usable and the rest can be redrawn.
 */
export async function reconcile(comic: Comic): Promise<Comic> {
  if (comic.status !== "generating" || comic.collection !== "new") return comic;
  if (await isActive(comic.id)) return comic;
  const job = await readJob(comic.id);
  if (job) {
    job.token = "";
    await saveJob(comic.id, job);
  }
  return updateComic(comic.id, (c) => {
    for (const page of c.pages) {
      if (page.status === "pending") {
        page.status = "failed";
        page.error = "Interrupted before this page was drawn.";
      }
    }
    c.status = c.pages.some((p) => p.status === "ready") ? "ready" : "failed";
    c.error = c.status === "failed" ? "This comic was interrupted before anything was drawn." : undefined;
    c.progress = undefined;
  });
}

// ---- running ---------------------------------------------------------------

/**
 * Work on a job until it is done or this run's time is nearly up, then hand
 * the rest to a fresh run. Safe to call twice: only the token holder works.
 */
export async function runJob(id: string, token: string): Promise<void> {
  const started = Date.now();
  const deadline = started + RUN_BUDGET_MS;

  for (;;) {
    const job = await readJob(id);
    if (!job || job.token !== token) return;

    if (Date.now() - started > START_BY_MS[job.step]) {
      await handOff(id, job);
      return;
    }
    await saveJob(id, job);

    try {
      switch (job.step) {
        case "ingest":
          await stepIngest(id, job, deadline);
          break;
        case "script":
          await stepScript(id, job, deadline);
          break;
        case "stills":
          await stepStills(id, job);
          break;
        case "draw":
          await stepDraw(id, job, deadline);
          break;
        case "done":
          await stepDone(id, job);
          return;
      }
    } catch (error) {
      await failComic(id, job, error);
      return;
    }
  }
}

async function handOff(id: string, job: Job): Promise<void> {
  const headers: Record<string, string> = { "content-type": "application/json", "x-worker-key": workerKey() };
  // Preview deployments sit behind Vercel's login; this lets the server through.
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    // A fresh token per attempt: if an earlier attempt does arrive late, its
    // run finds the token has moved on and stops, so the job never runs twice.
    job.token = randomUUID();
    await saveJob(id, job);
    try {
      const res = await fetch(`${job.origin}/api/work`, {
        method: "POST",
        headers,
        body: JSON.stringify({ id, token: job.token }),
        // Generous: a cold start (or a dev server compiling the route) is slow.
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) return;
    } catch {
      // Try again below.
    }
    await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
  }
  // Nobody picked it up; the comic will show as interrupted once it goes stale.
}

async function failComic(id: string, job: Job, error: unknown): Promise<void> {
  const message = describeError(error);
  job.token = "";
  await saveJob(id, job).catch(() => undefined);
  await updateComic(id, (c) => {
    c.status = c.pages.some((p) => p.status === "ready") ? "ready" : "failed";
    c.error = message;
    c.progress = undefined;
    for (const page of c.pages) {
      if (page.status === "pending") {
        page.status = "failed";
        page.error = message;
      }
    }
  }).catch(() => undefined);
  await cleanUp(job).catch(() => undefined);
}

// ---- steps -------------------------------------------------------------------

async function stepIngest(id: string, job: Job, deadline: number) {
  const finished = await ingest({
    id,
    state: job.ingest,
    deadline,
    progress: (line) => setProgress(id, line),
    save: () => saveJob(id, job),
  });
  if (!finished) {
    await saveJob(id, job);
    return;
  }
  if (!job.request.prompt.trim() && job.ingest.sources.length === 0) {
    throw new Error(job.ingest.notes[0] ?? "There was nothing to work from. Add a prompt, a photo, a video or a link.");
  }
  job.step = "script";
  await saveJob(id, job);
}

async function sourceParts(sources: JobSource[]): Promise<Part[]> {
  const parts: Part[] = [];
  for (const source of sources) {
    if (source.kind === "text") {
      parts.push(text(source.text));
    } else if (source.kind === "image") {
      const bytes = await readBytes(source.file);
      if (bytes) parts.push(text(`Image — ${source.label}:`), image(bytes));
    } else {
      const label = `${source.type[0].toUpperCase()}${source.type.slice(1)} — ${source.label}:`;
      parts.push(text(label));
      parts.push(
        source.mime
          ? ({ type: source.type, uri: source.uri, mime_type: source.mime } as Part)
          : ({ type: "video", uri: source.uri } as Part),
      );
    }
  }
  return parts;
}

function tidyScript(raw: ComicScript, allowEmpty = false): ComicScript {
  const pages = (raw.pages ?? [])
    .map((page) => ({
      summary: page.summary?.trim() ?? "",
      panels: (page.panels ?? []).filter((panel) => panel?.action?.trim()).slice(0, 7),
    }))
    .filter((page) => page.panels.length > 0);
  if (!pages.length && !allowEmpty) throw new Error("The script came back without any pages. Try again with a little more direction.");
  return {
    title: raw.title?.trim().toUpperCase() || "UNTITLED",
    tagline: raw.tagline?.trim() ?? "",
    logline: raw.logline?.trim() ?? "",
    setting: raw.setting?.trim() ?? "",
    characters: (raw.characters ?? []).filter((c) => c?.name && c?.look),
    cover: { concept: raw.cover?.concept ?? raw.logline ?? "", blurb: raw.cover?.blurb ?? "" },
    pages,
    back: { concept: raw.back?.concept ?? "" },
  };
}

async function stepScript(id: string, job: Job, deadline: number) {
  if (job.extendFrom !== undefined) return stepMorePages(id, job, deadline);
  const era = getEra(job.request.era);
  const hasVideo = job.ingest.sources.some((s) => s.kind === "media" && s.type === "video");
  const range = pageRange(job.request.pages, job.ingest.seconds, job.request.single);
  await setProgress(id, hasVideo ? "Writing the script from the video…" : "Writing the script…");

  const script = tidyScript(
    await generateJson<ComicScript>({
      parts: [...(await sourceParts(job.ingest.sources)), text(scriptRequest(job.request.prompt, job.ingest.notes, job.request.title))],
      system: scriptSystem(era, range, hasVideo),
      schema: scriptSchema(range, hasVideo),
      deadline,
    }),
    job.request.single,
  );

  // A title the maker typed wins over the one the writer picked, letter for letter.
  if (job.request.title) script.title = job.request.title;

  job.refs = job.ingest.sources
    .filter((s): s is Extract<JobSource, { kind: "image" }> => s.kind === "image")
    .slice(0, 4)
    .map((s) => ({ file: s.file, label: s.label, role: "likeness" }));

  await updateComic(id, (c) => {
    c.title = script.title;
    c.tagline = script.tagline;
    c.script = script;
    c.sources = job.ingest.shown;
    c.pages = [
      { id: "cover", kind: "cover", status: "pending" },
      ...script.pages.map((page, i): ComicPage => ({
        id: `page-${pad(i + 1)}`,
        kind: "page",
        status: "pending",
        caption: page.summary,
      })),
      { id: "back", kind: "back", status: "pending" },
    ];
  });

  // Timestamps only mean something when there is exactly one video to seek in.
  job.step = job.ingest.videos.length === 1 && (await hasFfmpeg()) ? "stills" : "draw";
  await saveJob(id, job);
}

/** Adding to a finished comic: write only the new pages, then draw them. */
async function stepMorePages(id: string, job: Job, deadline: number) {
  const comic = await getComic(id);
  const script = comic.script;
  if (!script) throw new Error("This comic has no script to add to.");
  const era = getEra(comic.era);
  const hasVideo = job.ingest.sources.some((s) => s.kind === "media" && s.type === "video");
  const range = pageRange(job.request.pages, job.ingest.seconds);
  await setProgress(id, "Writing the next pages…");

  const full = scriptSchema(range, hasVideo) as { properties: Record<string, unknown> };
  const raw = await generateJson<{ pages: ScriptPage[]; characters?: ScriptCharacter[] }>({
    parts: [...(await sourceParts(job.ingest.sources)), text(continuationRequest(script, job.request.prompt, job.ingest.notes))],
    system: scriptSystem(era, range, hasVideo),
    schema: {
      type: "object",
      properties: { pages: full.properties.pages, characters: full.properties.characters },
      required: ["pages", "characters"],
    },
    deadline,
  });
  const added = tidyScript({ ...script, pages: raw.pages ?? [], characters: raw.characters ?? [] }).pages;
  const known = new Set(script.characters.map((c) => c.name.toLowerCase()));
  const newcomers = (raw.characters ?? []).filter((c) => c?.name && c?.look && !known.has(c.name.toLowerCase()));

  const photos = job.ingest.sources
    .filter((s): s is Extract<JobSource, { kind: "image" }> => s.kind === "image")
    .map((s): ComicRef => ({ file: s.file, label: s.label, role: "likeness" }));
  job.refs = [...photos, ...job.refs].slice(0, 8);

  await updateComic(id, (c) => {
    if (!c.script) return;
    c.script = { ...c.script, pages: [...c.script.pages, ...added], characters: [...c.script.characters, ...newcomers] };
    c.pages = appendPages(c.pages, added.map((p) => p.summary));
    c.sources = [...(c.sources ?? []), ...job.ingest.shown];
  });
  job.step = job.ingest.videos.length === 1 && (await hasFfmpeg()) ? "stills" : "draw";
  await saveJob(id, job);
}

/** Turn a finished comic (a single, or a short book) into a longer one with what was just added. */
export async function extendComic(
  id: string,
  request: { prompt: string; pages: number; uploads: UploadRef[]; links: string[] },
  origin: string,
): Promise<{ comic: Comic; token: string }> {
  const comic = await getComic(id);
  if (comic.collection !== "new" || !comic.script) throw new Error("This comic cannot be added to.");
  if (await isActive(id)) throw new Error("This comic is still being drawn.");
  const old = await readJob(id);
  const token = randomUUID();
  const updated = await updateComic(id, (c) => {
    c.status = "generating";
    c.error = undefined;
    c.progress = "Reading what you added…";
  });
  await saveJob(id, {
    token,
    heartbeat: Date.now(),
    origin,
    step: "ingest",
    request: {
      era: comic.era,
      artist: comic.artist ?? DEFAULT_ARTIST,
      ...old?.request,
      prompt: request.prompt,
      pages: request.pages,
      single: false,
    },
    ingest: newIngest(request.uploads, request.links),
    refs: old?.refs ?? [],
    extendFrom: comic.script.pages.length,
  });
  return { comic: updated, token };
}

/** Stills of the cast and of each page's key moments, kept in the private folder. */
async function stepStills(id: string, job: Job) {
  await setProgress(id, "Pulling stills from the video…");
  const comic = await getComic(id);
  const script = comic.script;
  const video = job.ingest.videos[0];
  if (!script || !video) {
    job.step = "draw";
    await saveJob(id, job);
    return;
  }

  const duration = job.ingest.seconds;
  const clamp = (t: number) => Math.min(Math.max(t, 0), duration ? Math.max(duration - 0.3, 0) : t);
  const wanted: { seconds: number; ref: ComicRef }[] = [];

  let cast = 0;
  // Pages a comic already had were drawn from an earlier video: leave their stills alone.
  const from = job.extendFrom ?? 0;
  for (const character of from ? [] : script.characters) {
    if (typeof character.timestamp !== "number" || cast >= 4) continue;
    cast += 1;
    wanted.push({
      seconds: character.timestamp,
      ref: { file: privatePath(id, `refs/cast-${pad(cast)}.jpg`), label: character.name, role: "likeness" },
    });
  }
  for (const [index, page] of script.pages.entries()) {
    if (index < from) continue;
    const stamps = page.panels.map((p) => p.timestamp).filter((t): t is number => typeof t === "number");
    // First, middle and last moment of the page: enough to stage it, cheap to send.
    const picks = [...new Set([stamps[0], stamps[Math.floor(stamps.length / 2)], stamps[stamps.length - 1]])].filter(
      (t): t is number => typeof t === "number",
    );
    for (const [n, seconds] of picks.entries()) {
      wanted.push({
        seconds,
        ref: {
          file: privatePath(id, `refs/scene-p${pad(index + 1)}-${n + 1}.jpg`),
          label: `page ${index + 1}, ${Math.round(seconds)}s into the video`,
          role: "scene",
          page: index + 1,
        },
      });
    }
  }

  const local = await downloadToTemp(video.ref, video.name);
  try {
    const saved: (ComicRef | null)[] = wanted.map(() => null);
    let next = 0;
    // Seeking is slow on long or high-frame-rate video, so grab several at once.
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        for (let i = next++; i < wanted.length; i = next++) {
          const frame = await grabFrame(local, clamp(wanted[i].seconds));
          if (!frame) continue;
          await writeBytes(wanted[i].ref.file, frame, "image/jpeg");
          saved[i] = wanted[i].ref;
        }
      }),
    );
    job.refs.push(...saved.filter((ref): ref is ComicRef => ref !== null));
  } finally {
    await (await import("node:fs/promises")).rm(local, { force: true });
  }
  job.step = "draw";
  await saveJob(id, job);
}

async function stepDraw(id: string, job: Job, deadline: number) {
  const comic = await getComic(id);
  const pending = comic.pages.filter((p) => p.status === "pending");
  const coverReady = comic.pages.some((p) => p.kind === "cover" && p.status === "ready");
  const shareDue = comic.share?.status === "pending" && coverReady;
  if (!pending.length && shareDue) {
    await setProgress(id, "Painting the poster…");
    await drawShare(id, deadline);
    await saveJob(id, job);
    return;
  }
  if (!pending.length) {
    job.step = "done";
    await saveJob(id, job);
    return;
  }

  // The cover goes first: every other sheet is drawn to match it.
  const coverPending = pending.find((p) => p.kind === "cover");
  const batch = coverPending ? [coverPending] : pending.slice(0, DRAW_BATCH);
  const total = comic.pages.length;
  const done = total - pending.length;
  await setProgress(
    id,
    coverPending ? "Drawing the cover…" : `Inking the pages… ${done} of ${total} done`,
  );

  // The share poster is painted alongside the pages, once the cover it copies exists.
  const [results] = await Promise.all([
    Promise.all(batch.map((page) => drawOne(id, job, page.id, deadline))),
    shareDue && !coverPending ? drawShare(id, deadline) : Promise.resolve(),
  ]);
  const blocked = results.find((r) => r.startsWith("blocked:"));
  if (blocked) {
    // This artist cannot draw here at all; do not spend the rest of the queue finding that out.
    const message = blocked.slice("blocked:".length) || BILLING_MESSAGE;
    await updateComic(id, (c) => {
      for (const page of c.pages) {
        if (page.status === "pending") {
          page.status = "failed";
          page.error = message;
        }
      }
    });
    job.step = "done";
  }
  await saveJob(id, job);
}

/** Draw one sheet and record the outcome on it. "blocked:<message>" means no sheet can be drawn. */
async function drawOne(id: string, job: Job, pageId: string, deadline: number): Promise<string> {
  try {
    await drawPage(id, job, pageId, deadline);
    return "ok";
  } catch (error) {
    const blocked = isBillingError(error) || (error as Error)?.name === "ArtistUnavailableError";
    const message = (error as Error)?.name === "ArtistUnavailableError" ? (error as Error).message : describeError(error);
    await updateComic(id, (c) => {
      const page = c.pages.find((p) => p.id === pageId);
      if (!page) return;
      page.attempts = (page.attempts ?? 0) + 1;
      // Rate limits and timeouts get another go in the next batch.
      if (!blocked && isTransient(error) && page.attempts < MAX_ATTEMPTS) return;
      page.status = "failed";
      page.error = message;
    });
    return blocked ? `blocked:${message}` : "failed";
  }
}

async function drawPage(id: string, job: Job, pageId: string, deadline: number): Promise<void> {
  const comic = await getComic(id);
  const script = comic.script;
  const page = comic.pages.find((p) => p.id === pageId);
  if (!script || !page) throw new Error("This comic has no script to draw from.");
  const era = getEra(comic.era);
  const number = page.kind === "page" ? Number(pageId.split("-")[1]) : 0;
  const artist = getArtist(page.drawWith ?? comic.artist ?? DEFAULT_ARTIST);

  const refs: Reference[] = [];
  const attach = async (label: string, file: string) => {
    const bytes = await readBytes(file);
    if (!bytes) return false;
    refs.push({ label, data: bytes });
    return true;
  };

  // The cover leads: every other sheet is drawn to match it.
  let hasAnchor = false;
  if (page.kind !== "cover") {
    const cover = comic.pages.find((p) => p.kind === "cover" && p.status === "ready" && p.urls);
    if (cover?.urls) {
      // The 1280px copy is plenty for matching style, and much lighter to send.
      const bytes = await fetchSheet(cover.urls.w1280);
      if (bytes) {
        refs.push({ label: "COVER — the finished front cover of this comic", data: await toJpeg(bytes, 1024) });
        hasAnchor = true;
      }
    }
  }

  let hasLikeness = false;
  for (const ref of job.refs.filter((r) => r.role === "likeness").slice(0, 4)) {
    if (await attach(`LIKENESS — ${ref.label}`, ref.file)) hasLikeness = true;
  }

  const scenes = job.refs.filter((r) => r.role === "scene");
  const wanted =
    page.kind === "page"
      ? scenes.filter((r) => r.page === number).slice(0, 3)
      : // Cover and back get a couple of moments from across the book for setting.
        [scenes[0], scenes[Math.floor(scenes.length / 2)]].filter((r, i, all) => r && all.indexOf(r) === i);
  let hasScene = false;
  for (const ref of wanted) {
    if (await attach(`SCENE — ${ref.label}`, ref.file)) hasScene = true;
  }

  // Artists that take fewer references get the most important ones: cover, then people, then scenes.
  const kept = refs.slice(0, artist.refs);
  const note = referenceNote(
    hasLikeness && kept.some((r) => r.label.startsWith("LIKENESS")),
    hasScene && kept.some((r) => r.label.startsWith("SCENE")),
    hasAnchor && kept.some((r) => r.label.startsWith("COVER")),
  );
  const base =
    page.kind === "cover"
      ? coverPrompt(script, era, comic.issue ?? 1, note)
      : page.kind === "back"
        ? backPrompt(script, era, note)
        : pagePrompt(script, script.pages[number - 1], number, era, note);

  // A requested change starts from the page as drawn, with the marks laid over a copy of it.
  let prompt = base;
  if (page.edit && page.urls) {
    const current = await fetchSheet(page.urls.w1280);
    if (current) {
      const jpeg = await toJpeg(current, 1024);
      const edits: Reference[] = [{ label: "CURRENT — this page as it is drawn now", data: jpeg }];
      if (page.edit.marks.length) edits.push({ label: "MARKED — the same page with red marks around what to change", data: await markPage(jpeg, page.edit.marks) });
      kept.splice(0, kept.length, ...[...edits, ...kept].slice(0, artist.refs));
      prompt = editPrompt(base, page.edit.prompt, page.edit.marks.length > 0);
    }
  } else if (page.edit) {
    prompt = `${base}\n\nAlso: ${page.edit.prompt}`;
  }

  const drawn = await drawWith(artist.id, { prompt, refs: kept, deadline });
  const rev = (page.rev ?? 0) + 1;
  const urls = await saveSheet(id, page, rev, drawn.data, drawn.mime);
  await updateComic(id, (c) => {
    const target = c.pages.find((p) => p.id === pageId);
    if (!target) return;
    target.urls = urls;
    target.rev = rev;
    target.status = "ready";
    target.error = undefined;
    target.attempts = 0;
    target.artist = drawn.artist;
    target.drawWith = undefined;
    target.edit = undefined;
  });
  if (page.rev) await removePaths(sheetFiles(id, pageId, page.rev)).catch(() => undefined);
}

/** The artist that paints the poster: the comic's own if this server reaches it directly. */
export function shareArtist(comic: Comic, keys: { openai: boolean; gemini: boolean }): string {
  const own = getArtist(comic.artist ?? DEFAULT_ARTIST);
  return artistRoutes(own, keys)[0] === "gateway" ? DEFAULT_ARTIST : own.id;
}

/** Paint the share poster from the finished cover. Never fails the comic. */
async function drawShare(id: string, deadline: number): Promise<void> {
  const comic = await getComic(id);
  const cover = comic.pages.find((p) => p.kind === "cover" && p.status === "ready" && p.urls);
  if (!comic.script || !cover?.urls) return;
  try {
    const bytes = await fetchSheet(cover.urls.w1280);
    const refs: Reference[] = bytes
      ? [{ label: "COVER — the finished front cover of this comic", data: await toJpeg(bytes, 1024) }]
      : [];
    const drawn = await drawWith(shareArtist(comic, serverKeys()), {
      prompt: sharePrompt(comic.script, getEra(comic.era), comic.issue ?? 1),
      refs,
      deadline,
      aspect: "landscape",
    });
    const rev = (comic.share?.rev ?? 0) + 1;
    const url = await saveShareImage(id, rev, drawn.data);
    await updateComic(id, (c) => {
      c.share = { status: "ready", url, rev, artist: drawn.artist };
    });
    if (comic.share?.rev) await removePaths([shareFile(id, comic.share.rev)]).catch(() => undefined);
  } catch (error) {
    await updateComic(id, (c) => {
      const attempts = (c.share?.attempts ?? 0) + 1;
      const again = isTransient(error) && attempts < MAX_ATTEMPTS;
      c.share = { ...c.share, status: again ? "pending" : "failed", attempts, error: again ? undefined : describeError(error) };
    });
  }
}

/** The page with the marks drawn over it in red, for the artist to see what to change. */
async function markPage(jpeg: Buffer, marks: [number, number][][]): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const meta = await sharp(jpeg).metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1536;
  return sharp(jpeg)
    .composite([{ input: Buffer.from(marksSvg(marks, width, height)), top: 0, left: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer();
}

async function fetchSheet(url: string): Promise<Buffer | null> {
  if (url.startsWith("/api/files/")) return readBytes(decodeURIComponent(url.slice("/api/files/".length)));
  try {
    const res = await fetch(url);
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

async function stepDone(id: string, job: Job) {
  await updateComic(id, (c) => {
    // No cover to copy means no poster; the share link falls back to the cover card.
    if (c.share?.status === "pending") c.share = { ...c.share, status: "failed", error: "The cover was not drawn." };
    const ready = c.pages.filter((p) => p.status === "ready").length;
    c.status = ready > 0 ? "ready" : "failed";
    c.error = ready > 0 ? undefined : (c.pages.find((p) => p.error)?.error ?? "Nothing could be drawn.");
    c.progress = undefined;
  });
  job.token = "";
  await saveJob(id, job);
  await cleanUp(job);
}

/** Files that only mattered while the comic was being made. */
async function cleanUp(job: Job): Promise<void> {
  await Promise.all(job.ingest.remoteFiles.map((name) => deleteFile(name)));
  job.ingest.remoteFiles = [];
  const uploads = job.ingest.items.flatMap((item) => (item.type === "upload" ? [uploadPath(item.upload.ref)] : []));
  // The upload folder (local) or file (Blob) goes; the stills taken from it stay for redraws.
  await removePaths(uploads.map((p) => (p.endsWith("/file") ? p.slice(0, -"/file".length) : p)));
}
