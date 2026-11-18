// Pulls the cover art from andreslikescomics.com into the local library as
// "classic" comics, one folder per comic:
//   library/originals/classics/classic-01-.../comic.json + cover.png
// Safe to re-run: existing covers are kept, manifests are refreshed.
// Then run scripts/build-classics.mjs to make the files the site serves.
//
//   node scripts/import-classics.mjs

import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ORIGIN = "https://andreslikescomics.com";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMICS_DIR = path.join(ROOT, "library", "originals", "classics");

const CLASSICS = [
  ["WILL WE FIND BOHDAN'S LOVE 2", "a8738373-ffa1-4e9e-a60e-dc2405cf9e1a"],
  ["BALLROOM", "0d698cb5-2814-452b-9d15-27520727159d"],
  ["ANDRES AND TYLER HAVE ARRIVED", "862e4c58-dec4-4f60-90ae-a0415bd1a5d8"],
  ["TECHSPHERE GOES UNSPIRALED", "6e4c2b28-c5ad-4175-9c74-129e2af3fa1d"],
  ["DOOBIE", "e0c136eb-c1f1-4223-85c4-3c30ed4bfaf9"],
  ["ICEMAN IS BURNING?", "322dfbed-d487-4102-804d-8aeb584f3f72"],
  ["SHIRT SWAP", "ab0d674d-8819-4cfd-a3ff-842bac8566d0"],
  ["WAR TIME", "8381ec16-11dc-43a4-ada3-93b437719239"],
  ["GANG IS ON THE MOVE", "123b07d3-525e-4b47-8717-70d529355bdd"],
  ["KAYA TAKES ON TORREY PINES", "8a76119f-875a-4af8-933a-6238e5078405"],
  ["MANDIEGO BY THE BEACH", "16dc92fe-ac2e-4898-896e-9100e28d8c85"],
  ["OK SO LET ME TELL YOU ABOUT HOW TO FLY A PLANE", "a0aefa4c-e82c-4a0c-89b9-13285997742e"],
  ["CALM BEFORE THE RACES", "70595a51-8a74-4c17-a99c-0cfe59b85034"],
  ["IT'S NOT A GAME (Illinois)", "d2b3a2e4-2046-47b7-a0b4-ff743a24b116"],
  ["INTERVIEW DAY", "24a1f6ee-e4d0-4121-b1a3-cb80813af1af"],
  ["AI MAN — CREATIVE INTERN", "4611047b-52f9-42ed-9094-77fa11ae1525"],
  ["WANTED — IF HE TALKS TO A GIRL", "d4945ca3-6d81-4886-b9c0-3ea8ada1a620"],
  ["WANTED: VIBE CODER", "053c9c70-da0a-443a-ad48-e27a80cb4cbc"],
  ["RETURN OF LAUREN MCKINNON", "7cc55924-5748-4659-b6c0-7b9b9bbbc698"],
  ["BURNING STUDIO LIGHTS — THE WORLD ON FIRE", "8aa236af-6a62-4df4-bdb4-4b0cb7bbec52"],
  ["SPEED CUBER JOINS BURNING STUDIO", "bbb5c16b-3a7a-4b94-a11b-cde9be610ac8"],
  ["WHAT IF I TALKED TO BOHDAN'S LOST LOVE?", "89256295-0710-45d9-817b-a64a366a6116"],
  ["WHY DIDN'T HE BRING HIS ID?", "c93a8c22-9a0a-4bdd-b5a8-49e15d7d4cec"],
  ["WHERE IS ABDUL?!", "3a3f8146-f9a1-4af1-b171-b6642103b441"],
  ["HACKATHON? TAKE A SHOT!", "e3fa4997-2402-4974-9c95-09bb85062060"],
  ["ADRENALINE! FIGHT OR FLIGHT?", "a05c48da-b952-4993-95dd-14d3beb27821"],
  ["DRONE SOLUTIONS MAN", "5e192b0a-14fc-4421-b739-a1ff25e7a9d3"],
  ["ADRENALINE! FIGHT OR FLIGHT?", "a48492e2-f0a2-4562-9eeb-d8f23870ca0d"],
  ["I'D INSIST YOU LEAVE.", "02012ce6-71d9-456d-9fcb-8f104d1e20f3"],
  ["WHERE IS AKSHAY?", "e87e97d0-a1b0-4026-9149-1027e7b709f6"],
  ["LLOW IS NOT IMMORTAL: Redboy", "a2b76bde-0481-4f4b-9044-d73d68f3025c"],
  ["THE FEAST (Graphic Novel)", "239cefe4-6d25-42b9-8e4b-39266b0524ee"],
  ["WHAT DO YOU MEAN I CAN'T WEAR THESE?", "d7924ad3-e11c-4b7f-adde-5d859a103efd"],
  ["NIGHT BEFORE LOLLA", "c37c653f-0ee1-4108-afa4-658486c79328"],
  ["THEY CAN BUY THROUGH THE MARKETPLACE", "27c4f75c-e193-4810-8580-297d83a4fff6"],
  ["THE FEAST", "23cf2a28-3f86-487a-a2a5-8866d1412db1"],
  ["DYLAN STRIKES AGAIN", "601433c2-dba0-43a9-9533-a3acb80afbc6"],
  ["CROSSOVER — ROCKETT MEETS PHOENIX", "dfdfe910-1710-431b-b31f-cf5063b71cd6"],
  ["STEVE & ANDRES HIT BOARD & BREW", "4785da28-7af9-4e64-8fa1-b7a599b1e685"],
  ["DEELIVESMATER SAYS FREE HIM", "e67f9fe4-47c0-4837-ad14-827d872da38c"],
];

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

const exists = (p) => access(p).then(() => true, () => false);

async function importOne([title, upload], index) {
  const number = index + 1;
  const id = `classic-${String(number).padStart(2, "0")}-${slugify(title)}`;
  const dir = path.join(COMICS_DIR, id);
  await mkdir(dir, { recursive: true });

  const coverPath = path.join(dir, "cover.png");
  let fetched = false;
  if (!(await exists(coverPath))) {
    const res = await fetch(`${ORIGIN}/lovable-uploads/${upload}.png`);
    if (!res.ok) throw new Error(`${title}: HTTP ${res.status}`);
    await writeFile(coverPath, Buffer.from(await res.arrayBuffer()));
    fetched = true;
  }

  const comic = {
    id,
    title,
    issue: number,
    collection: "classic",
    era: "burning-classic",
    // Classics keep the order they had on the old site.
    order: number,
    createdAt: new Date(Date.UTC(2025, 0, 1) - index * 86_400_000).toISOString(),
    status: "ready",
    source: { kind: "import", from: ORIGIN },
    pages: [{ id: "cover", kind: "cover", file: "cover.png", status: "ready" }],
  };
  await writeFile(path.join(dir, "comic.json"), JSON.stringify(comic, null, 2));
  return fetched;
}

const queue = CLASSICS.map((entry, i) => [entry, i]);
let fetched = 0;
let failed = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        if (await importOne(...job)) fetched += 1;
      } catch (err) {
        failed += 1;
        console.error("failed:", err.message);
      }
    }
  }),
);
console.log(`classics: ${CLASSICS.length} listed, ${fetched} downloaded, ${failed} failed`);
if (failed) process.exitCode = 1;
