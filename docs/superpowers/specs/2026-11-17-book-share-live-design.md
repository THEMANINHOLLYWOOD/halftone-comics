# Bound books, one-drop making, share links and live heroes — design

## Intent and why

Make the studio feel effortless and alive:

- making a comic takes one move (drop a file),
- the comic is a real object in your hands (sealed in its bag, bound at the
  spine, pages that turn like paper),
- sending it to someone takes one tap, and the link shows a painted preview,
- every page of the site is live: everyone on it shows up as an original comic
  hero cursor, and heroes react to each other.

Success: a new visitor drops a photo and is reading their comic as it is drawn
without touching a form; a friend opens the shared link, peels the seal, and the
comic slides out of its bag; two people on the shelf at once see each other and
their heroes scrap when they touch.

## Decided with the owner

- Share preview images are **painted by the artist** (one extra drawing per new
  comic, about $0.05–0.20 and 30–60 s more), not composed.
- Live cursors use **Supabase Realtime**, installed through the Vercel
  Marketplace as `andres-comics-live` and connected to `andres-comics-studio`
  (production and preview). Its public URL and anon key are in the project's
  environment variables (`NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- The earlier "sheets that draw themselves" design
  (`2026-11-17-sheet-drawing-design.md`) is folded in: it plays on the book's
  pages.

## Goals, non-goals, anti-goals

Goals: the four parts below, phone first, at 60 fps on a recent iPhone.

Non-goals: accounts or sign-in; chat; stored cursor history; changing how
scripts are written or sheets are drawn (beyond the share image and an optional
title).

Anti-goals (a failure even if it technically works): more UI than today; a book
that feels like a flat CSS flipbook; laggy or jittery cursors; a seal that is a
fiddly gesture; heroes that copy existing characters.

## Approaches

**Book.** (1) Extend our own three.js stage — picked: keeps the bending-paper
look, lighting and springs we already have. (2) A page-flip library
(StPageFlip, turn.js) — rejected: flat 2D, loses the 3D paper. (3) Rewrite in
react-three-fiber — rejected: new dependency, nothing gained.

**Realtime.** (1) Supabase Realtime presence + broadcast — picked and approved:
no server code, built for this. (2) Our own WebSockets on Vercel Functions with
Redis pub/sub between instances — rejected: more moving parts we would run and
pay for anyway. (3) Cloudflare Durable Objects / PartyKit — rejected: a second
platform and account.

**Share image.** (1) Painted by the artist — picked by the owner. (2) Composed
from the cover — kept only as the fallback (see below).

**Maker.** (1) Drop, then it starts on its own after a short countdown unless
you start adding detail — picked: one move by default, room for detail.
(2) Always a Make button — one more tap every time. (3) Start the instant files
land — no chance to add a title.

## Part 1 — Minimal UI and one-drop making

**Controls become icons.** The footer keeps the title and one quiet line
(era · No. · page). Under it, one row of icon buttons with labels for screen
readers and hover titles: previous, read (shelf only), flip, view, save,
share, more (…), next. More holds redraw, draw missing and remove. Touch
targets at least 44 px. The tick scrubber stays. "Drawn by" and captions move
into View. The header is the ink-dot mark and wordmark on the left; an index
(grid) icon and a round **+** on the right. Collection filters move inside the
index.

**Making.** Drop files anywhere on any page, or tap **+**, which opens the
system file picker straight away (no panel first). A small tray rises from the
bottom:

```
 ┌──────────────────────────────────────────────┐
 │ [img][img][vid 62%]   Title (optional)    +  │
 │                                     ( Make ◔)│
 └──────────────────────────────────────────────┘
```

- Thumbnails show upload progress as a ring.
- When every file has finished sending, the Make button's ring counts down
  3 s and the comic starts. Typing in the title, opening **+**, or adding more
  files stops the countdown; then the person taps Make.
- **+** expands the tray into the existing detail fields: story, links, era,
  pages, artist. Defaults stay as today (newsstand era, auto pages, default
  artist, remembered artist choice).
- Pasting an image or link anywhere still adds it to the tray.
- A title typed here becomes the comic's title as written; the script keeps
  writing the tagline and everything else. (`GenerateRequest` gains an optional
  `title`.)
- Starting opens the new comic straight away, drawing live, as today.
- *(My call)* Making without a file still works. Tapping **+** opens the tray
  and the file picker together, so cancelling the picker leaves the tray, where
  **+** gives the story field and a link box. The countdown runs for dropped or
  picked files and for a link pasted outside a text box; once someone types a
  story or a title, they tap Make themselves.

## Part 2 — Share links and painted share images

**Link.** Every comic gets `/c/<id>`. It renders the same studio, opened on that
comic. Its metadata gives title, tagline as description, and the share image as
`og:image` / `twitter:image` (large card), with absolute URLs on the deployed
domain.

**Share button.** On phones it opens the system share sheet with the title and
link; elsewhere it copies the link and says "Link copied". When the maker's own
comic finishes, the share icon gets a brief highlight so it is easy to find.

**Painted image.** After the cover is drawn, the pipeline draws one more
image: a wide promo piece for this comic in its era's style, using the finished
cover as the reference so characters and title match, with the title lettered
in. It is stored as a 1200×630 JPEG beside the sheets and recorded on the comic
(not a page, so it never appears in the book). It is drawn by the comic's
artist, counts as one more drawing, and is redrawn whenever the cover is
redrawn. *(My call)* It is asked for in landscape and center-cropped to
1200×630, so artists without a landscape size still work; if the comic's
artist cannot draw on this server any more, the default artist paints it.

**Address bar.** *(My call)* Opening any comic changes the address to
`/c/<id>` without reloading, and closing it goes back to `/`, so the browser's
Back button closes the book and any open comic's address can be copied.

**Fallback.** Classics, older comics, comics whose painting failed, and links
opened before the painting is done get a composed image instead: the cover on
the paper background with the title, made on request. A painting failure never
fails the comic.

## Part 3 — The bound book, the bag and the seal

**Shelf.** The row stays, but each comic is a closed book: cover on top, a
thin page block on the fore-edge, a spine. It can still be picked up, bent a
little (a book is stiffer than a sheet), and flipped over to show the back
cover. Comics this device has never opened sit in a clear, slightly crinkled
poly bag with a fold-over flap and a strip of tape; the bag catches light as
the book moves.

**Breaking the seal.** Opening a sealed comic (Read, Enter, or arriving on its
share link) brings the bagged book forward. A swipe across the tape or a tap
peels it, the flap lifts, and the comic slides out of the bag, which drifts away.
This happens once per comic per device (remembered locally). Comics made on
this device are never bagged for their maker. Reduced motion: one tap, a fade.

**Reading.** The book opens on its spine: the cover swings left, showing a
spread. Pages keep today's pairing (cover / page 1 on the first leaf, and so
on). Turning: drag a page from anywhere on it; it lifts and curls around a
moving axis that follows the finger, bends more the faster it goes, and on
release completes or falls back with momentum. A tap on either half or the
arrow keys turn one page with the same curl. A turning page shades the page
under it. The page blocks on each side grow and shrink as you read. Back or
Escape closes the book and it slides back into the row.

**Framing.** Desktop and landscape frame the whole spread. Phones in portrait
frame the right-hand page and follow the turning page, so text stays readable.

**Drawing live.** Pages still being drawn show the blue-pencil roughs; arriving
pages play the drawing replay from the earlier design, on the book page.

**Classics.** Only the covers of the 40 classics survive, so they are closed
books that cannot be opened (cover, and the typeset back as today). *(My call)*
They are bagged too; the first time someone views a classic up close (View),
they peel its seal and it slides out of the bag.

## Part 4 — Live heroes

**Places.** Everyone on the shelf is in one room; everyone reading the same
comic is in that comic's room, wherever they are in it. Moving between them
leaves one room and joins the other.

**Heroes.** Eight original heroes in the site's four-ink style: flat color
with black ink line, about 40 px. Each has its own idle motion, movement trail,
hover reaction, drag pose and click move, with a lettered sound effect.
Example cast (names and looks are the builder's to refine, all original):

| Hero | Type | Trail | Click |
|---|---|---|---|
| Volt | speed | speed lines | ZAP bolt |
| Gale | flight | cape ripple | WHOOSH gust |
| Brick | power | dust puffs | POW ground slam |
| Gearhead | tech | sparks | BZZT beam |
| Hex | magic | glyph sparkles | FWOOM sigil |
| Shade | stealth | ink smoke | blink teleport |
| Splash | elemental | droplets | SPLOOSH wave |
| Bloom | nature | petals | vine snap |

A visitor gets a random hero on first visit, remembered on the device. A small
stack of hero faces at the top shows who is here; tapping your own lets you
pick another. No names are shown or stored.

**Your cursor.** On desktop your hero is your cursor over the stage (hotspot at
its hand; the normal text cursor returns over inputs). On phones your hero
follows your finger while it is down and parks where you lift it; others see it
there.

**Positions.** Over the stage, positions are sent in the stage's own world
coordinates, so a hero pointing at a panel points at the same panel on every
screen size. Elsewhere they fall back to screen fractions. Sent about 12 times a
second while moving, nothing while still; others' heroes glide between updates.
Presence carries the hero choice and input kind (mouse or touch).

**When heroes touch.** If two heroes come within a hero's width of each other
while one is moving, they fight: a cartoon dust cloud with limbs and lettered
POW/BAM/ZAP, about 1.2 s, then the loser is knocked back with dizzy stars and the
winner strikes a pose. The outcome is worked out the same way on every screen
from the two heroes (a type wheel, with ties broken by a shared value), so no
server decides it. The same pair waits a few seconds before fighting again.
Knockback only moves the hero drawing, never anyone's real pointer. Reduced
motion: a small bump instead.

**Who you see.** *(My call)* Every position carries where it is: a shelf
position, or a spread in the comic. You only see heroes on the same view as
you (the same spread, or the part of the shelf row on your screen), and
fights only happen between heroes on the same view, measured in world
coordinates so every screen agrees. Everyone else in the room shows only in the
face stack.

**Keeping it light (the free plan).** *(My call)* Send nothing while you are
alone in a room. Otherwise the send rate shrinks as the room fills, keeping the
whole room to a fixed budget of messages a second (about 12 a second with two
people, down to about 2 a second each in a full room), and receivers glide
between updates so it still looks smooth. Leave the room when the tab is
hidden; show at most 20 other heroes; drop heroes that stop sending. If
Supabase refuses or limits the connection, the heroes quietly disappear and
the rest of the site is untouched. Upgrading the plan is the owner's call later.

## Constraints

- Next.js 16 App Router, three.js stage in `lib/stage`, Vercel, private Blob for
  storage (sheets served through `/api/files`). Image models: the ones with a
  working key on the server (OpenAI today); the picker already marks the rest
  unavailable.
- Phone first: iPhone Safari WebGL2, device pixel ratio capped at 2, textures
  loaded only near the current page.
- Privacy: no names, no tracking beyond the hero choice and opened-comics list
  kept on the device.
- Accessibility: every icon labelled, keyboard controls kept, reduced motion
  respected throughout.
- Cost: one more drawing per new comic; Supabase free plan to start.

## Build order

Each part ships on its own: 1 minimal UI and making, 2 share links and images,
3 book, bag and seal (with the drawing replay), 4 live heroes.

## Left to the builder

Curl math and stiffness, exact timings, hero artwork and animation details,
bag material, icon drawings, countdown length tuning, share-image prompt
wording, how the share image is stored and named, and the exact room names.

## Addendum (owner, 2026-11-17, during the build)

- **For everyone.** Nothing personal ships: the old classics leave the site
  (kept locally in `archive/`, never deployed), the site and imprint get a
  neutral name kept in one constant (`lib/brand.ts`), and the Classics filter
  goes away.
- **Front and back are a pair.** The back cover shows the back of the front
  cover's scene, as if you walked around it, drawn from the finished cover, with
  back-cover furniture.
- **Singles first.** One photo and nothing else makes a *single*: a front and
  back cover only (two drawings, fast), shown as a closed comic with a little
  thickness. When it is done, the maker is offered "Add photos to make it a
  book": more photos (or a story) continue the same comic with interior pages
  drawn to match, inserted before the back cover.
- **Crafted building.** While a comic is being made, the stage and footer show
  it being produced like a comic studio, by the heroes: a production line
  (script, pencils, inks, colors, letters) with the hero doing each step and a
  line like "Volt is pencilling page 2", instead of a plain status line. The
  drawing replay's pencil is held by the visitor's own hero.
- **Mobile first** everywhere.

## Addendum 2 (owner, 2026-11-17 late): super cursors and a simpler UI

References: two clips of polished, 3D-looking hero pieces on white with soft
shadows that act on a button (giant hands grab and rip it apart; an armoured
helmet assembles over it, eyes light, faceplate opens). The owner wants that
level of polish for every cursor, minimal and ultra smooth, phone first.

- **Original heroes only.** The references show Marvel characters; the site
  uses original heroes with the same *kinds* of powers, never those characters.
- **Suit up.** A visitor starts with a plain pointer; their first click on the
  page "suits them up": the cursor transforms into their hero's signature piece
  (not a whole figure): e.g. a rocket gauntlet with thruster flame, a storm
  hammer that spins, a web-shooter wrist, giant titan hands, a speedster's
  bolt, a mystic glyph ring, a shadow cloak, a frost crystal.
- **Powers act on the comics.** Each cursor has one signature interaction:
  titan hands grab the sealed bag and rip it open; the web line grabs a page
  corner and pulls it over; the hammer strikes a page and lightning turns it;
  the gauntlet blasts to fly to the next comic; and so on. Hover and tap each
  get their own small animation.
- **Look.** Pre-rendered sprite art in a clean 3D-render style (soft shadow,
  white ground), animated with transforms and sprite swaps; small files, 60 fps
  on phones; reduced motion gets static poses.
- **Simpler UI everywhere**, aimed at one thing: helping people make and tell
  more comics.
