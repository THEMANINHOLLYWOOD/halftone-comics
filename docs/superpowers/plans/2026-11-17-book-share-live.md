# Bound Books, Drop-to-Make, Share Links and Live Heroes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the four parts of the design, each live on its own: a minimal icon UI with one-drop making, share links with painted preview images, comics as sealed, bound books with real page turning (and the drawing replay), and live hero cursors.

**Architecture:** The client studio (`components/Studio.tsx`) drives a three.js stage (`lib/stage`) that gains a shelf of closed, bagged books and an open-book mode with curl physics. The server pipeline (`lib/pipeline.ts`) gains one extra painted image per comic. A new `/c/[id]` route renders the same studio with per-comic metadata. Live presence runs entirely in the browser on Supabase Realtime channels (presence + broadcast), drawn as a DOM overlay projected through the stage.

**Tech Stack:** Next.js 16.4.6 (App Router, `cacheComponents` on), React 19.3, three 0.187, Tailwind 4, AI SDK 7, sharp, Vercel Blob (private), `@supabase/supabase-js` (new), Vitest (new, dev only).

**Spec:** `docs/superpowers/specs/2026-11-17-book-share-live-design.md`, which folds in `docs/superpowers/specs/2026-11-17-sheet-drawing-design.md`. Read both.

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before using any Next.js API (metadata, route handlers, `next/og`, caching under `cacheComponents`).
- This folder is not a git repository: skip every commit; never commit or push. Before Task 1, copy the source tree (excluding `node_modules`, `.next`, `.vercel`, `library/`) to the session scratchpad as `baseline/` for the final review diff.
- Never print, log or commit secret values. `.env.local` already holds `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; do not run `vercel env pull` into `.env.local` (it would overwrite local-only secrets).
- Absolute links use `process.env.NEXT_PUBLIC_SITE_URL ?? "https://comics.inchipala.com"`.
- Heroes are original characters only; no names, likenesses or costumes of existing characters.
- Every icon button: `aria-label` and `title`, touch target ≥ 44 px on phones.
- `prefers-reduced-motion: reduce` gets fades and taps instead of animation everywhere (seal, turning, replay, fights).
- Stage: device pixel ratio capped at 2; textures loaded only near the current sheet or spread (existing radius rules).
- Values pinned by the spec or decided here: countdown `3000` ms; share image `1200×630` JPEG; send rate `0`/s alone, else `clamp(24 / people, 2, 12)`/s; at most `20` other heroes drawn; a silent peer dropped after `5000` ms; fight `1200` ms; same-pair cooldown `5000` ms; replay timing pencils 0.3–3.6 s, color 3.4–6.2 s, settle 6.0–7.0 s; waiting roughs revealed over ~90 s.
- Copy: tray title placeholder `Title (optional)`; button `Make`; share fallback toast `Link copied`.
- Done means: `npx vitest run`, `npx tsc --noEmit`, `npm run lint` and `npm run build` all pass, and the part was checked in the browser at desktop and phone (375×812) sizes.

## Review Focus

1. A tray whose uploads are still sending, or all failed, must never auto-start a comic from nothing (test in Task 2).
2. A share link to a removed, unknown or malformed comic id gives a not-found page, never a crash or a path outside `comics/` (test in Task 6).
3. Rotating a phone mid-read (single page ↔ spread) keeps the same page in view (test in Task 9).
4. Both heroes in a touch noticing it at once must produce exactly one fight (test in Task 14).
5. A peer whose tab closes or whose network drops disappears within 5 s instead of freezing on screen (test in Task 14).

---

## File map

| File | Responsibility |
|---|---|
| `vitest.config.ts` | Test runner with the `@/` alias (new) |
| `lib/uploads.ts` | Upload helpers moved out of `Composer.tsx`: `sendToServer`, `sendToBlob`, `asLink`, `kindOf` |
| `lib/tray.ts` | Pure make-tray rules: when the countdown is armed |
| `components/MakeTray.tsx` | The bottom tray (replaces `Composer.tsx`, which is deleted) |
| `components/icons.tsx` | All UI icons as small components |
| `components/SheetControls.tsx` | The footer: title line and icon row (out of `Studio.tsx`) |
| `lib/share.ts` | Share URLs, metadata choice, path parsing, Web Share / clipboard |
| `lib/local.ts` | On-device memory: opened comics, comics made here, chosen hero |
| `app/c/[id]/page.tsx` | Share page: metadata + the studio opened on that comic |
| `app/api/og/[id]/route.tsx` | Composed fallback share image |
| `lib/stage/spring.ts`, `shaders.ts`, `textures.ts` | Split out of `engine.ts` (no behavior change) |
| `lib/stage/curl.ts` | Pure page-curl pose math (mirrored in GLSL) |
| `lib/stage/view.ts` | Pure book navigation and camera framing |
| `lib/stage/book.ts` | Open book: leaves on a spine, turning physics, stacks, shadow |
| `lib/stage/closed-book.ts` | Shelf item: closed book with thickness |
| `lib/stage/bag.ts`, `lib/stage/seal.ts` | Bag and seal meshes / pure seal timeline |
| `lib/stage/drawing/analyse.ts`, `replay.ts` | Drawing replay: image analysis / time map, nib, roughs |
| `lib/live/heroes.ts`, `budget.ts`, `interp.ts`, `room.ts` | Roster and fights / send rate / smoothing / Supabase room |
| `components/live/HeroArt.tsx`, `HeroLayer.tsx`, `PresenceStack.tsx` | Hero drawings / overlay / who's-here faces |

---

## Part 1 — Minimal UI and one-drop making

### Task 1: A maker's title, end to end (and the test runner)

**Files:**
- Create: `vitest.config.ts`, `lib/prompts.test.ts`
- Modify: `package.json` (devDependency `vitest`, script `"test": "vitest run"`), `lib/types.ts` (`GenerateRequest.title?: string`), `lib/prompts.ts`, `lib/pipeline.ts:65,136,381,394`, `app/api/generate/route.ts`

**Interfaces:**
- Produces: `cleanTitle(raw: unknown): string | undefined` and `scriptRequest(prompt: string, notes: string[], title?: string): string` in `lib/prompts.ts`; `GenerateRequest.title?: string`; `Job.request.title?: string`.

- [ ] **Step 1: Install Vitest and add `vitest.config.ts`** resolving `@` to the project root, environment `node`.
- [ ] **Step 2: Write the failing tests** in `lib/prompts.test.ts`:

```ts
test("cleanTitle trims, collapses spaces, drops control chars and caps at 60", () => {
  expect(cleanTitle("  The   Night\u0007 Shift ")).toBe("The Night Shift");
  expect(cleanTitle("x".repeat(80))).toHaveLength(60);
  expect(cleanTitle("   ")).toBeUndefined();
  expect(cleanTitle(42)).toBeUndefined();
});
test("scriptRequest pins a given title", () => {
  expect(scriptRequest("", [], "Cat Patrol")).toContain('The title is fixed: "Cat Patrol"');
  expect(scriptRequest("", [])).not.toContain("The title is fixed");
});
```

- [ ] **Step 3: Run** `npx vitest run lib/prompts.test.ts`. Expected: FAIL, `cleanTitle` not exported.
- [ ] **Step 4: Implement.** `cleanTitle` as tested. `scriptRequest` adds the line `The title is fixed: "<title>". Use it exactly as \`title\`.` when given. The route reads `body.title` through `cleanTitle`; `startComic` stores it on the job and uses it (not the prompt) as the id seed and initial `title` when present; after the script is written, `c.title = job.request.title ?? script.title` and `script.title` is set to the same value, so cover prompts letter it.
- [ ] **Step 5: Run** `npx vitest run` and `npx tsc --noEmit`. Expected: PASS.

### Task 2: Upload helpers and the countdown rule

**Files:**
- Create: `lib/uploads.ts`, `lib/tray.ts`, `lib/tray.test.ts`
- Modify: `components/Composer.tsx` (import the moved helpers; deleted in Task 3)

**Interfaces:**
- Produces:
  - `lib/uploads.ts`: `sendToServer(file: File, onProgress: (f: number) => void): Promise<UploadRef>`, `sendToBlob(...)` same signature, `asLink(value: string): string | null`, `kindOf(file: File): string` (moved verbatim).
  - `lib/tray.ts`: `COUNTDOWN_MS = 3000`; `interface TrayState { files: { done: boolean; failed: boolean }[]; links: number; linkPasted: boolean; title: string; story: string; detailsOpen: boolean; busy: boolean }`; `autoStartArmed(s: TrayState): boolean`.

- [ ] **Step 1: Write the failing tests** in `lib/tray.test.ts`:

```ts
const base: TrayState = { files: [], links: 0, linkPasted: false, title: "", story: "", detailsOpen: false, busy: false };
test("arms once every file has finished", () => {
  expect(autoStartArmed({ ...base, files: [{ done: true, failed: false }] })).toBe(true);
  expect(autoStartArmed({ ...base, files: [{ done: true, failed: false }, { done: false, failed: false }] })).toBe(false);
});
test("never arms on nothing: all failed, or empty", () => {
  expect(autoStartArmed({ ...base, files: [{ done: false, failed: true }] })).toBe(false);
  expect(autoStartArmed(base)).toBe(false);
});
test("a failed file does not block the good ones", () => {
  expect(autoStartArmed({ ...base, files: [{ done: true, failed: false }, { done: false, failed: true }] })).toBe(true);
});
test("a pasted link arms; typing or opening + disarms", () => {
  expect(autoStartArmed({ ...base, links: 1, linkPasted: true })).toBe(true);
  expect(autoStartArmed({ ...base, files: [{ done: true, failed: false }], title: "A" })).toBe(false);
  expect(autoStartArmed({ ...base, files: [{ done: true, failed: false }], story: "B" })).toBe(false);
  expect(autoStartArmed({ ...base, files: [{ done: true, failed: false }], detailsOpen: true })).toBe(false);
  expect(autoStartArmed({ ...base, files: [{ done: true, failed: false }], busy: true })).toBe(false);
});
```

- [ ] **Step 2: Run** `npx vitest run lib/tray.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** both files; point `Composer.tsx` at `lib/uploads.ts`.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit`. Expected: PASS.

### Task 3: The make tray

**Files:**
- Create: `components/MakeTray.tsx`
- Delete: `components/Composer.tsx`
- Modify: `components/Studio.tsx` (render `MakeTray` in place of `Composer`; `n` key opens it)

**Interfaces:**
- Consumes: `lib/uploads.ts`, `lib/tray.ts` (Task 2), `GenerateRequest.title` (Task 1), `ArtistPicker`, `ERAS`.
- Produces: `MakeTray({ open, info, onOpen, onClose, onStarted, pickRequest }: { open: boolean; info: StudioInfo; onOpen(): void; onClose(): void; onStarted(comic: Comic): void; pickRequest: number })`. Each increment of `pickRequest` opens the tray and calls the hidden file input's `click()` in the same user gesture.

- [ ] **Step 1: Build the tray** per spec Part 1: hidden when empty and closed; rises from the bottom (safe-area padded) with thumbnails and progress rings, the `Title (optional)` field, a round **+** that expands story, link box, era, pages and artist (the old Composer fields, restyled minimally), and `Make` with a countdown ring driven by `autoStartArmed` and `COUNTDOWN_MS`. Adding files restarts the countdown. Drop anywhere and paste anywhere still feed it (move the window listeners from Composer). Escape or the tray's close icon clears and closes it.
- [ ] **Step 2: Verify in the browser** (`preview_start` "comic-sheets"): drop one image → countdown → comic starts and opens; type a title → countdown stops, `Make` starts it with that title; **+** with picker cancelled → story-only comic can be made; phone size: tray fits above the home bar, inputs don't zoom (16 px text). Use a cheap story-only run once; don't spam generations.
- [ ] **Step 3: Run** `npx tsc --noEmit && npm run lint`. Expected: no errors.

### Task 4: Icon controls and a minimal header

**Files:**
- Create: `components/icons.tsx`, `components/SheetControls.tsx`
- Modify: `components/Studio.tsx` (header, footer, index filters, More menu)

**Interfaces:**
- Produces: icons `IconPrev, IconNext, IconRead, IconFlip, IconView, IconSave, IconShare, IconMore, IconGrid, IconPlus, IconClose` (`(props: { size?: number }) => JSX.Element`, 1.6 px stroke, `currentColor`). `SheetControls` takes the values Studio already computes (`comic, page, reading, canStep, step, flip, open, view, saveHref, onShare, secondary actions`) and renders: title, one quiet meta line, the icon row (prev, read [shelf, readable], flip, view, save, share, more, next) and the tick scrubber. `onShare` is a no-op placeholder until Task 6.

- [ ] **Step 1: Build** per spec Part 1. More (…) opens the existing menu with Redraw, Draw missing, Remove. "Drawn by" and the caption move into `PageViewer`'s label. Header: ink dots + wordmark, then `IconGrid` (index) and a round `IconPlus` that bumps `pickRequest`. Filters render only inside the index.
- [ ] **Step 2: Verify in the browser** at desktop and 375×812: every control reachable, labels present (`read_page` shows names), nothing wraps to two rows on the phone.
- [ ] **Step 3: Run** `npx tsc --noEmit && npm run lint && npm run build`. Expected: pass.
- [ ] **Step 4: Ship Part 1**: `vercel deploy --prod --yes`, then load https://comics.inchipala.com and check the tray and icons on desktop and phone sizes.

---

## Part 2 — Share links and painted share images

### Task 5: Painted share image in the pipeline

**Files:**
- Create: `lib/share-image.test.ts`
- Modify: `lib/types.ts`, `lib/draw.ts`, `lib/prompts.ts`, `lib/library.ts`, `lib/pipeline.ts`

**Interfaces:**
- Produces:
  - `lib/types.ts`: `interface ShareImage { status: PageStatus; url?: string; rev?: number; artist?: string; attempts?: number; error?: string }`; `Comic.share?: ShareImage`.
  - `lib/draw.ts`: `drawWith(artistId, { prompt, refs, deadline, aspect?: "portrait" | "landscape" })`; landscape is `1536x1024` / `3:2`.
  - `lib/prompts.ts`: `sharePrompt(script: ComicScript, era: Era, issue: number): string`.
  - `lib/library.ts`: `saveShareImage(id: string, rev: number, data: Buffer): Promise<string>`: sharp `resize(1200, 630, { fit: "cover", position: "attention" })`, JPEG quality 84, path `comics/<id>/share.r<rev>.jpg`, returns its URL.
  - `lib/pipeline.ts`: `shareArtist(comic: Comic, keys: { openai: boolean; gemini: boolean }): string` (the comic's artist if it has a route on this server, else `DEFAULT_ARTIST`).

- [ ] **Step 1: Write the failing tests:**

```ts
test("sharePrompt asks for a wide promo with the title lettered", () => {
  const p = sharePrompt(script({ title: "CAT PATROL" }), getEra("newsstand"), 3);
  expect(p).toMatch(/landscape/i);
  expect(p).toContain('"CAT PATROL"');
});
test("shareArtist falls back when the comic's artist has no route", () => {
  expect(shareArtist(comic({ artist: DEFAULT_ARTIST }), { openai: true, gemini: false })).toBe(DEFAULT_ARTIST);
  expect(shareArtist(comic({ artist: "google/gemini-x" }), { openai: true, gemini: false })).toBe(DEFAULT_ARTIST);
});
```

(`script()` / `comic()` are small fixture builders in the test file.)

- [ ] **Step 2: Run** `npx vitest run lib/share-image.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `startComic` sets `share: { status: "pending" }`.
  - In `stepDraw`, once the cover is ready and `share.status === "pending"`, `drawShare(id, deadline)` runs alongside the page batch. It uses the cover's `w1280` as the only reference, `aspect: "landscape"`, and the same transient-retry rule as pages via `attempts`/`MAX_ATTEMPTS`. On final failure it sets `status: "failed"` and never touches `comic.status`.
  - The "nothing pending → done" check also waits for a pending share.
  - `redrawPage(id, "cover")` sets the share back to `pending`, and deletes the old file after the repaint.
  - The listing `summary()` keeps `share`.
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit`. Expected: PASS.

### Task 6: Share pages, fallback image, address bar and the share button

**Files:**
- Create: `lib/share.ts`, `lib/share.test.ts`, `lib/local.ts`, `lib/local.test.ts`, `app/c/[id]/page.tsx`, `app/api/og/[id]/route.tsx`
- Modify: `components/Studio.tsx` (prop `initialId?: string`, history sync, share action, highlight), `components/SheetControls.tsx` (`onShare`), `components/MakeTray.tsx` (`markMade` on start), `app/layout.tsx` (`metadataBase`)

**Interfaces:**
- Produces:
  - `lib/share.ts`:
    - `siteUrl(): string`
    - `comicPath(id: string): string` (`/c/<id>`)
    - `parseComicPath(pathname: string): string | null` (valid ids only, same rule as `assertId`)
    - `shareMeta(comic: Comic): { title: string; description: string; image: string }`: the painted `share.url` when ready, else `/api/og/<id>`; always absolute.
    - `shareComic(comic: Comic): Promise<"shared" | "copied" | "cancelled">`: Web Share when `navigator.share` exists and the pointer is coarse, else clipboard.
  - `lib/local.ts`: `isOpened(id)`, `markOpened(id)`, `isMade(id)`, `markMade(id)`, `getHero(): string | null`, `setHero(id: string)` (Task 16 validates the id against `HEROES`). Each takes an optional `store: Pick<Storage, "getItem" | "setItem">` (defaults to `localStorage`, tolerating private mode).

- [ ] **Step 1: Write the failing tests:**

```ts
test("parseComicPath accepts only real comic ids", () => {
  expect(parseComicPath("/c/20261117-cat-patrol-ab12")).toBe("20261117-cat-patrol-ab12");
  expect(parseComicPath("/c/../secrets")).toBeNull();
  expect(parseComicPath("/c/")).toBeNull();
  expect(parseComicPath("/")).toBeNull();
});
test("shareMeta prefers the painting and is always absolute", () => {
  const painted = shareMeta(comic({ share: { status: "ready", url: "/api/files/comics/x/share.r1.jpg" } }));
  expect(painted.image).toBe("https://comics.inchipala.com/api/files/comics/x/share.r1.jpg");
  expect(shareMeta(comic({ id: "x", share: { status: "pending" } })).image).toBe("https://comics.inchipala.com/api/og/x");
});
test("local memory survives a throwing store", () => {
  const broken = { getItem: () => { throw new Error(); }, setItem: () => { throw new Error(); } };
  expect(isOpened("a", broken)).toBe(false);
  expect(() => markOpened("a", broken)).not.toThrow();
});
```

- [ ] **Step 2: Run** `npx vitest run lib/share.test.ts lib/local.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `app/c/[id]/page.tsx`: `generateMetadata` reads the comic through a cached helper (per the Next 16 docs for `cacheComponents`; revalidate in minutes so a painting that lands later shows up). It returns `openGraph` and `twitter: { card: "summary_large_image" }` from `shareMeta`. Unknown or malformed ids call `notFound()`. The page renders `<Studio initialId={id} />`.
  - `app/api/og/[id]/route.tsx`: `ImageResponse` at 1200×630, showing the cover (absolute `w640` URL) on the paper color with the title in Anton. A comic with no cover gets the title alone.
  - Studio:
    - `open()` calls `history.pushState(null, "", comicPath(id))` and `close()` calls `pushState(null, "", "/")`. A `popstate` listener maps the path back through `parseComicPath`.
    - `initialId` opens that comic when it's readable, and otherwise selects it on the shelf.
    - The share icon calls `shareComic`; `"copied"` shows `Link copied`.
    - When a comic with `isMade(id)` turns `ready`, the share icon pulses for 4 s.
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`. Expected: pass.
- [ ] **Step 5: Verify in the browser:**
  - `/c/<a real id>` opens that comic.
  - The page source has `og:image`.
  - `/c/nope` shows not-found.
  - Back closes the book.
  - Share copies the link.
  - `/api/og/<classic id>` renders.
- [ ] **Step 6: Ship Part 2:**
  - Run `vercel deploy --prod --yes`.
  - Make one real comic on production and confirm the painted image appears under `share` within its run and is served at its URL.
  - Fetch `/c/<id>` with `curl -A "Twitterbot"` and check the `og:image` tag.

---

## Part 3 — The bound book, the bag and the seal

### Task 7: Split the stage engine (no behavior change)

**Files:**
- Create: `lib/stage/spring.ts` (`Spring`), `lib/stage/shaders.ts` (`SHEET_VERTEX`, `PAPER_FRAGMENT` + shared GLSL chunks), `lib/stage/textures.ts` (`FaceTextures` class wrapping today's `load` / `bind` / `syncTextures` / LRU logic)
- Modify: `lib/stage/engine.ts`

- [ ] **Step 1: Move code** without changing behavior; `engine.ts` keeps `Stage` and input handling.
- [ ] **Step 2: Verify in the browser:** shelf drag, bend, flip, wheel and read behave as before; `npx tsc --noEmit && npm run build` pass.

### Task 8: Page-curl math

**Files:**
- Create: `lib/stage/curl.ts`, `lib/stage/curl.test.ts`
- Modify: `lib/stage/shaders.ts` (add `LEAF_VERTEX` using the same formula)

**Interfaces:**
- Produces: a leaf is a strip from the spine (`u = 0`) to its edge (`u = 1`, world width 1), bent as a circular arc whose angle runs linearly from the spine angle `a` to the tip angle `t`; angles are measured from +x toward +z (up), so `0` lies flat on the right and `π` flat on the left.
  - `leafPoint(u: number, a: number, t: number): { x: number; z: number; nx: number; nz: number }`
  - `tipAngleFor(pointerX: number): number` (the tip angle that puts a flat leaf's edge under a pointer at world `x`, clamped to `[0, π]`)
  - `clampPose(a: number, t: number): { a: number; t: number }` (keeps every angle in `[0, π]`)

```ts
// φ(u) = a + (t - a)·u ; position = ∫ (cos φ, sin φ) du (closed form; when |t - a| < 1e-4 use the straight-line limit)
```

- [ ] **Step 1: Write the failing tests:**

```ts
test("flat on the right and on the left", () => {
  expect(leafPoint(1, 0, 0)).toMatchObject({ x: 1, z: 0 });
  const left = leafPoint(1, Math.PI, Math.PI);
  expect(left.x).toBeCloseTo(-1); expect(left.z).toBeCloseTo(0);
});
test("arc length is preserved while curled", () => {
  let length = 0, prev = leafPoint(0, 0.6, 2.1);
  for (let i = 1; i <= 200; i++) { const p = leafPoint(i / 200, 0.6, 2.1); length += Math.hypot(p.x - prev.x, p.z - prev.z); prev = p; }
  expect(length).toBeCloseTo(1, 2);
});
test("a turning leaf never dips below the stack", () => {
  for (let u = 0; u <= 1; u += 0.05) expect(leafPoint(u, 0.3, 2.8).z).toBeGreaterThanOrEqual(0);
});
test("tipAngleFor maps the pointer to the edge", () => {
  expect(tipAngleFor(1)).toBeCloseTo(0); expect(tipAngleFor(0)).toBeCloseTo(Math.PI / 2); expect(tipAngleFor(-2)).toBeCloseTo(Math.PI);
});
```

- [ ] **Step 2: Run** `npx vitest run lib/stage/curl.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `curl.ts` and the GLSL twin (uniforms `uSpine`, `uTip`, plus `uLift` for stack height and today's `uTwist` for corner grabs).
- [ ] **Step 4: Run** the tests. Expected: PASS.

### Task 9: Book navigation and framing

**Files:**
- Create: `lib/stage/view.ts`, `lib/stage/view.test.ts`

**Interfaces:**
- Produces:
  - `type BookLayout = "spread" | "single"`.
  - `interface BookPos { index: number; face: 0 | 1 }` (today's leaf / face meaning).
  - `bookFrame(leaves: number, pos: BookPos, layout: BookLayout): { turned: number; cameraX: number }`. The closed front centres on `0.5`, the closed back on `-0.5`, a spread on `0`, single pages on `±0.5`.
  - `stepBook(leaves: number, pos: BookPos, dir: 1 | -1, layout: BookLayout): BookPos | null`. In a spread, `(i,1)` and `(i+1,0)` are the same view, so a step skips the duplicate.
  - `normalise(leaves: number, pos: BookPos, layout: BookLayout): BookPos` (clamps out-of-range positions and folds `(i+1,0)` to `(i,1)` in spreads).

- [ ] **Step 1: Write the failing tests:**

```ts
test("single layout: right page, then the left page behind it", () => {
  expect(bookFrame(3, { index: 0, face: 0 }, "single")).toEqual({ turned: 0, cameraX: 0.5 });
  expect(bookFrame(3, { index: 0, face: 1 }, "single")).toEqual({ turned: 1, cameraX: -0.5 });
});
test("spread layout: cover, spreads, back", () => {
  expect(bookFrame(3, { index: 0, face: 0 }, "spread").cameraX).toBe(0.5);
  expect(bookFrame(3, { index: 0, face: 1 }, "spread")).toEqual({ turned: 1, cameraX: 0 });
  expect(bookFrame(3, { index: 2, face: 1 }, "spread")).toEqual({ turned: 3, cameraX: -0.5 });
});
test("spread steps skip the duplicate view and stop at the ends", () => {
  expect(stepBook(3, { index: 0, face: 1 }, 1, "spread")).toEqual({ index: 1, face: 1 });
  expect(stepBook(3, { index: 2, face: 1 }, 1, "spread")).toBeNull();
  expect(stepBook(3, { index: 0, face: 0 }, -1, "spread")).toBeNull();
});
test("rotating the phone keeps the same page in view", () => {
  const pos = normalise(3, { index: 1, face: 0 }, "spread");
  expect(bookFrame(3, pos, "spread").turned).toBe(1);
});
test("out-of-range positions are clamped", () => {
  expect(normalise(1, { index: 5, face: 1 }, "single")).toEqual({ index: 0, face: 1 });
});
```

- [ ] **Step 2: Run** `npx vitest run lib/stage/view.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `view.ts`.
- [ ] **Step 4: Run** the tests. Expected: PASS.

### Task 10: The open book

**Files:**
- Create: `lib/stage/book.ts`
- Modify: `lib/stage/engine.ts`, `lib/stage/types.ts`, `components/StageCanvas.tsx`, `components/Studio.tsx` (step / canStep go through `stepBook` while reading)

**Interfaces:**
- Consumes: `leafPoint` / `LEAF_VERTEX` (Task 8), `bookFrame` / `stepBook` / `normalise` (Task 9), `FaceTextures` (Task 7).
- Produces (replacing `setSheets`):

```ts
type StageScene =
  | { mode: "shelf"; sheets: StageSheet[]; index: number; face: 0 | 1; sealed: (key: string) => boolean }
  | { mode: "book"; key: string; leaves: StageSheet[]; index: number; face: 0 | 1; sealed: boolean };
Stage.setScene(scene: StageScene): void
Stage.layout(): BookLayout            // "single" when the stage is portrait and narrower than 700 css px
StageCallbacks += { onLayout(layout: BookLayout): void; onSealBroken(key: string): void; onView(view: string): void }
```

- [ ] **Step 1: Build `Book`** per spec Part 3 "Reading":
  - Leaves are hinged at `x = 0`.
  - The right and left stacks are offset by about 0.003 per leaf.
  - Dragging a leaf drives the tip angle from `tipAngleFor` through a stiff spring. The spine angle follows the tip through a softer one, so the tip leads and the page curls. The page bends more the faster it moves.
  - On release, the turn completes or falls back depending on position and velocity.
  - A tap on either half, or an arrow key, animates one step along the same springs.
  - A turning leaf darkens the page beneath it near its footprint (uniform-driven soft shadow) and is lit by its analytic normal.
  - The camera pans to `bookFrame().cameraX` on a spring.
  - Reduced motion: leaves swap with a fade.
- [ ] **Step 2: Wire Studio** to send the `book` scene while reading. It reports `onIndex` / `onFace` exactly as today, and keeps the position through `normalise` when `onLayout` changes.
- [ ] **Step 3: Verify in the browser:** read a ready comic at desktop and 375×812, and rotate to landscape. Drag-turn, slow and fast; tap-turn; use the keys; hold a corner grab mid-turn; check the stacks and the shadow. Watch for no jitter, no z-fighting and 60 fps (performance panel or `requestAnimationFrame` timing).
- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`.

### Task 11: Closed books on the shelf

**Files:**
- Create: `lib/stage/closed-book.ts`
- Modify: `lib/stage/engine.ts`

- [ ] **Step 1: Build** each shelf item as a closed book.
  - The cover plane, back plane and page-block edges all use the sheet vertex shader, so the whole book bends together, with today's bend amplitudes scaled down for stiffness.
  - Flip turns the whole book over.
  - Read on a ready comic animates the shelf into the book: the neighbours slide away, the book centres, and the cover swings open. Close reverses it.
- [ ] **Step 2: Verify in the browser** at both sizes: shelf scroll, bend, flip, read and close round trip, with no texture pop.

### Task 12: Bag and seal

**Files:**
- Create: `lib/stage/seal.ts`, `lib/stage/seal.test.ts`, `lib/stage/bag.ts`
- Modify: `lib/stage/engine.ts`, `lib/stage/closed-book.ts`, `components/Studio.tsx` (sealed = `!isOpened(id) && !isMade(id)`; `onSealBroken` → `markOpened`; View on a sealed classic breaks its seal first)

**Interfaces:**
- Produces:
  - `sealPose(p: number): { tape: number; flap: number; slide: number; bagFade: number }`. The seal runs on one 0→1 timeline: tape peel 0–0.3, flap 0.25–0.5, slide 0.45–0.9, bag fade 0.8–1. Each part is eased and clamped to `[0, 1]`.
  - `Stage.breakSeal(): void` is the tap path.

- [ ] **Step 1: Write the failing tests:**

```ts
test("seal timeline order and bounds", () => {
  expect(sealPose(0)).toEqual({ tape: 0, flap: 0, slide: 0, bagFade: 0 });
  expect(sealPose(1)).toEqual({ tape: 1, flap: 1, slide: 1, bagFade: 1 });
  const mid = sealPose(0.4);
  expect(mid.tape).toBe(1); expect(mid.flap).toBeGreaterThan(0); expect(mid.slide).toBe(0);
  for (const p of [-1, 2]) Object.values(sealPose(p)).forEach((v) => expect(v).toBeGreaterThanOrEqual(0));
});
```

- [ ] **Step 2: Run** `npx vitest run lib/stage/seal.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `seal.ts`, then the bag per spec Part 3.
  - Bag: a clear sleeve slightly larger than the book, with fresnel sheen and procedural crinkle normals, a fold-over flap and a tape strip. It uses the sheet vertex shader so it bends with the book.
  - A swipe across the tape drives `p` directly; letting go past 0.3 completes the seal, otherwise it springs back.
  - A tap runs it to completion in about 1.4 s.
  - Reduced motion: a 300 ms fade.
  - Opening a sealed comic runs the seal and then opens the cover.
- [ ] **Step 4: Verify in the browser:**
  - A fresh profile (clear `localStorage`) shows every shelf book bagged.
  - The swipe and the tap both peel the seal, and the book slides out.
  - After a reload, that comic is unbagged.
  - A comic made on this device is never bagged.
  - A classic peels on View.
- [ ] **Step 5: Run** `npx vitest run && npx tsc --noEmit && npm run build`.

### Task 13: Pages that draw themselves

**Files:**
- Create: `lib/stage/drawing/analyse.ts`, `lib/stage/drawing/analyse.test.ts`, `lib/stage/drawing/replay.ts`
- Modify: `lib/stage/shaders.ts` (reveal uniforms in the paper fragment), `lib/stage/textures.ts`, `lib/stage/book.ts`, `lib/stage/closed-book.ts`, `lib/stage/paper.ts` (pending faces: the blue roughs move into the replay layer)

**Interfaces:**
- Produces:
  - `analyse(img: { data: Uint8ClampedArray; width: number; height: number }): Analysis`. `Analysis` is `{ width: number; height: number; time: Float32Array; palette: [number, number, number][]; seeds: { x: number; y: number; radius: number; start: number }[] }`:
    - `time` holds per-pixel stroke times in `[0, 1]` for edge pixels and `-1` for non-edge pixels.
    - The palette has 8 colors at most.
    - Seeds come one per palette cluster, with start times in `[0, 1]`.
  - `Replay` (in `replay.ts`) owns the time map and palette `DataTexture`s, the nib, and the waiting-roughs clock for one face. It exposes `start(now)`, `progress(now)` and `done`.

- [ ] **Step 1: Write the failing tests** on synthetic images:

```ts
test("a black square on white: edges on its border, two flats, ordered strokes", () => {
  const a = analyse(square(64, 96, { x: 16, y: 24, size: 32 }));
  expect(a.time[index(a, 16, 40)]).toBeGreaterThanOrEqual(0); // left border is an edge
  expect(a.time[index(a, 32, 40)]).toBe(-1);                  // inside is not
  expect(a.palette.length).toBe(2);
  const times = [...a.time].filter((t) => t >= 0);
  expect(Math.min(...times)).toBeGreaterThanOrEqual(0); expect(Math.max(...times)).toBeLessThanOrEqual(1);
});
test("never more than 8 flats", () => {
  expect(analyse(noise(64, 96)).palette.length).toBeLessThanOrEqual(8);
});
```

- [ ] **Step 2: Run** `npx vitest run lib/stage/drawing/analyse.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** per the sheet-drawing spec.
  - Analysis runs at about 320×480 off the main thread where possible (`OffscreenCanvas` / a module worker), with a main-thread fallback.
  - The shader reveals graphite edges sampled from the full-res texture where `time < clock`, and flats by the nearest palette color spreading from their seeds.
  - The nib is an SDF pencil, then a marker, with a soft shadow, following the stroke path on a spring.
  - Timing follows the Global Constraints.
  - It plays when an arrived face is first in view.
  - `?replay` replays every ready face once.
  - Reduced motion: a fade.
  - Waiting faces reveal the procedural blue roughs over about 90 s.
- [ ] **Step 4: Verify in the browser** with `?replay` on a ready comic, at both sizes, and on a live generating comic once.
- [ ] **Step 5: Run** `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`.
- [ ] **Step 6: Ship Part 3** with `vercel deploy --prod --yes`, and check the book, bag and replay on production at both sizes.

---

## Part 4 — Live heroes

### Task 14: Hero rules (roster, fights, send rate, smoothing)

**Files:**
- Create: `lib/live/heroes.ts`, `lib/live/budget.ts`, `lib/live/interp.ts`, `lib/live/live.test.ts`

**Interfaces:**
- Produces:
  - `heroes.ts`:
    - `type HeroType = "speed" | "flight" | "power" | "tech" | "magic" | "stealth" | "elemental" | "nature"`. The wheel runs in this order.
    - `type HeroId = "volt" | "gale" | "brick" | "gearhead" | "hex" | "shade" | "splash" | "bloom"`.
    - `HEROES: { id: HeroId; name: string; type: HeroType; ink: string; accent: string; sfx: string }[]`, with 8 entries as in the spec table.
    - `randomHero(): HeroId`.
    - `fightOutcome(a: HeroId, b: HeroId, roll: number): "a" | "b"`. With `d = (wheel(b) - wheel(a) + 8) % 8`: `d` in 1–3 gives `"a"`, 5–7 gives `"b"`, and 0 or 4 gives `roll < 0.5 ? "a" : "b"`.
    - `fightSender(self: string, other: string): boolean`. It is true only for the lexically smaller session id.
    - `FIGHT_MS = 1200`, `FIGHT_COOLDOWN_MS = 5000`, `REACH_WORLD = 0.08`, `REACH_SCREEN = 0.03`.
  - `budget.ts`: `sendRate(people: number): number` (messages per second).
  - `interp.ts`: `class Track { push(x: number, y: number, t: number): void; at(now: number): { x: number; y: number } | null; stale(now: number): boolean }`. It renders 120 ms behind the newest sample, and is stale after `5000` ms without one.

- [ ] **Step 1: Write the failing tests:**

```ts
test("send rate", () => {
  expect(sendRate(1)).toBe(0); expect(sendRate(2)).toBe(12); expect(sendRate(4)).toBe(6); expect(sendRate(21)).toBe(2);
});
test("fights: wheel, ties by roll, one sender", () => {
  expect(fightOutcome(hero("speed"), hero("power"), 0.9)).toBe("a");
  expect(fightOutcome(hero("power"), hero("speed"), 0.9)).toBe("b");
  expect(fightOutcome(hero("speed"), hero("magic"), 0.2)).toBe("a");
  expect(fightSender("s1", "s2")).toBe(true); expect(fightSender("s2", "s1")).toBe(false);
});
test("tracks glide between samples and go stale", () => {
  const t = new Track(); t.push(0, 0, 1000); t.push(10, 0, 1100);
  expect(t.at(1170)!.x).toBeCloseTo(5, 0);
  expect(t.stale(6200)).toBe(true);
});
test("every hero is unique and the roster has all 8 types", () => {
  expect(new Set(HEROES.map((h) => h.type)).size).toBe(8);
});
```

- [ ] **Step 2: Run** `npx vitest run lib/live/live.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the three modules.
- [ ] **Step 4: Run** the tests. Expected: PASS.

### Task 15: Rooms and stage projection

**Files:**
- Create: `lib/live/room.ts`
- Modify: `package.json` (`@supabase/supabase-js`), `lib/stage/engine.ts` (projection API), `components/StageCanvas.tsx` (`onReady(stage: Stage)`)

**Interfaces:**
- Consumes: `sendRate`, `Track`, `HEROES` (Task 14).
- Produces:
  - `Stage.unproject(clientX: number, clientY: number): { view: string; x: number; y: number } | null`.
    - `view` is `"shelf"` or `spread:<turned>`.
    - It returns world coordinates on the shelf row or page plane, or `null` when off the stage.
  - `Stage.project(view: string, x: number, y: number): { x: number; y: number } | null`. It returns client px, or `null` when `view` is not the current one.
  - `Stage.viewKey(): string`.
  - In `room.ts`:
    - `type Place = "shelf" | \`comic:${string}\``.
    - `interface Peer { session: string; hero: HeroId; input: "mouse" | "touch"; view: string; track: Track; pose: Pose }` where `Pose = "idle" | "move" | "hover" | "drag" | "click" | "ko" | "win"`.
    - `joinRoom(place: Place, me: { session: string; hero: HeroId; input: "mouse" | "touch" }): Room`.
    - `Room` has:
      - `peers(): Peer[]` (at most 20, stale ones dropped);
      - `move(view, x, y)`, throttled by `sendRate(people)`, sending nothing while alone;
      - `act(pose)`;
      - `fight(other, winner)`;
      - `onFight(cb)`;
      - `setHero(id)`;
      - `leave()`.
    - The channel is `place:<place>` with presence key `session`, and the events `move`, `act` and `fight`.
    - It leaves on `visibilitychange` → hidden and rejoins when visible.
    - Any subscribe error or limit sets `Room.down = true`, and the layer hides.

- [ ] **Step 1: Implement** `room.ts` with `createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)`, one client per tab, and `broadcast: { self: false }`. Then add the stage projection.
- [ ] **Step 2: Verify:**
  - Two browser tabs on the shelf see each other's presence (log the `peers().length`).
  - Moving in one tab moves a debug dot in the other at the same world point, at two different window sizes.
  - Hiding a tab removes it from the other within 5 s.
- [ ] **Step 3: Run** `npx tsc --noEmit && npm run lint`.

### Task 16: Heroes on screen

**Files:**
- Create: `components/live/HeroArt.tsx`, `components/live/HeroLayer.tsx`, `components/live/PresenceStack.tsx`
- Modify: `components/Studio.tsx` (session id per tab, `place` from reading state, render layer and stack), `app/globals.css` (hero keyframes)

**Interfaces:**
- Consumes: Tasks 14–15, plus `getHero` / `setHero` (Task 6).
- Produces:
  - `HeroArt({ hero, pose, facing }: { hero: HeroId; pose: Pose; facing: 1 | -1 })`, an inline SVG at about 40 px in the four-ink style. Each hero has its own idle, trail, hover, drag and click animation and its lettered sound effect.
  - `HeroLayer({ stage, room, me })` positions your hero and your peers every animation frame through refs, with no React render per frame.
  - `PresenceStack({ room, me, onPick })`.

- [ ] **Step 1: Build** per spec Part 4.
  - Over the canvas, the desktop cursor is your hero (`cursor: none`); the text cursor stays on inputs.
  - On touch, your hero follows your finger and parks where you lift it.
  - Hover means over the stage. Drag means a pointer down on the stage. Click plays your hero's move.
  - Fights:
    - When your hero and a peer on the same view are within `REACH_WORLD` (or `REACH_SCREEN` for screen-fraction views), and `fightSender` says so and the pair isn't cooling down, the sender rolls `fightOutcome` and broadcasts `fight`.
    - Everyone in the room plays the dust cloud with POW/BAM/ZAP for `FIGHT_MS`, then a knockback with dizzy stars for the loser and a win pose for the winner.
    - Knockback only moves the drawing, never the real pointer.
    - Reduced motion: a small bump.
  - The faces at the top show who's in the room; tapping your own opens the 8-hero picker.
- [ ] **Step 2: Verify in the browser** with two tabs, one at the phone size:
  - Both heroes appear at the same panel.
  - Touching them makes them fight once with the same winner in both tabs.
  - Cooldown, picking another hero, a 3rd tab, the reading room separate from the shelf, and a hidden tab disappearing all work.
- [ ] **Step 3: Run** `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`.
- [ ] **Step 4: Ship Part 4:**
  - Run `vercel deploy --prod --yes`.
  - On production, open two devices or tabs and confirm presence, movement and a fight.

### Task 17: Whole-change review

- [ ] **Step 1:** Diff the tree against the scratchpad `baseline/` and run a fresh reviewer over the diff, the spec and this plan. Fix what it confirms.
- [ ] **Step 2:** Re-run `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`, redeploy if anything changed, and recheck https://comics.inchipala.com on desktop and phone.
