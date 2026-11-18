# halftone — make a comic book

Turn photos, videos, links and notes into comic books drawn in the style of any
era. Every comic is kept as a set of sheets you can pick up, bend and flip.

## Run it

```bash
npm install
cp .env.example .env.local   # then put your Gemini key in it
npm run dev
```

Open http://localhost:3000. Without a key the shelf still works; drawing does not.
Locally, comics are kept as files in `library/`.

## Live site

Deployed on Vercel as the project `andres-comics-studio`, served at
https://comics.inchipala.com. Comics live in the private Vercel Blob store
`andres-comics-private`. Deploy changes with:

```bash
vercel deploy --prod
```

Production settings are the project's environment variables: `GEMINI_API_KEY`,
`OPENAI_API_KEY`, `STUDIO_PASSCODE` (asked for only when removing a comic;
anyone can make and redraw), `COMIC_SECRET`, and the Blob store's connection.

## Artists (image models)

Every comic is drawn by an artist you pick in the composer, and any sheet can be
redrawn with a different one to compare (**More → Redraw with…**). The curated
list lives in `lib/artists.ts`; any other AI Gateway image model can be typed in
by id. Each sheet records which model drew it.

| Route | Used for | Billing |
| --- | --- | --- |
| `OPENAI_API_KEY` | OpenAI GPT Image models | your OpenAI account |
| `GEMINI_API_KEY` | Google Nano Banana models, when the key's project has billing | Google |
| Vercel AI Gateway | everything else (FLUX, Seedream, MiniMax, Grok, Recraft…), and a fallback | AI Gateway credits (most image models need paid credits) |

## How a comic gets made

Generation runs as a chain of short background steps (each one well inside
Vercel's 5-minute function limit), handing off to a fresh run when time is short.

1. **Read** — everything dropped into the composer is handed to Gemini: photos,
   video and audio (through the Files API), PDFs and office documents, text
   files, web pages, YouTube links. On Vercel, files upload straight from the
   browser to Blob, so videos of any length up to 2 GB work.
2. **Script** — one structured script for the whole book: cast, cover, pages,
   panels, dialogue. For a video, every panel carries the timestamp it is drawn
   from, and the script must cover the video start to finish.
3. **Stills** — ffmpeg pulls a frame for each cast member and for the key
   moments of each page.
4. **Draw** — the cover first, then every page and the back cover a few at a
   time, each given the cover (to match its style), the cast stills and that
   page's scene stills, with the chosen artist (see `lib/draw.ts`).

Era presets live in `lib/eras.ts`. Each describes the drawing, colouring,
lettering, printing and cover furniture of a period, so pages come back looking
like scans of a real book from that time.

## Where things are

| Path | What |
| --- | --- |
| `lib/storage.ts` | Blob on Vercel, `library/` locally; same paths in both |
| `comics/<id>/` (in storage) | One folder per comic: `comic.json` plus each sheet at 4 sizes |
| `trash/` (in storage) | Records of comics you removed |
| `lib/pipeline.ts` | Sources → script → stills → sheets |
| `lib/gemini.ts` | The only file that talks to the model |
| `lib/prompts.ts` | The writer's brief and the art direction |
| `lib/stage/` | The WebGL stage: paper, bending, flipping |

## Keys on the stage

`←` `→` turn · `space` flip · `enter` read · `v` view full size · `esc` back · `g` index · `n` new comic

On a phone: drag the sheet to bend and flip it, use the arrows to move along,
and **View** to read a page full size (double-tap to zoom).
