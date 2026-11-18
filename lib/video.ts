// Stills from an uploaded video, so the artist can see the real people and
// places behind each panel. Uses the ffmpeg binary bundled by ffmpeg-static
// (so it also works on Vercel), falling back to one on the PATH.

import { execFile } from "node:child_process";
import { access, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import bundled from "ffmpeg-static";

const run = promisify(execFile);

let binary: Promise<string | null> | null = null;
function ffmpeg(): Promise<string | null> {
  binary ??= (async () => {
    if (typeof bundled === "string") {
      try {
        await access(bundled);
        return bundled;
      } catch {
        // Not shipped with this build; try the system one.
      }
    }
    try {
      await run("ffmpeg", ["-version"]);
      return "ffmpeg";
    } catch {
      return null;
    }
  })();
  return binary;
}

export async function hasFfmpeg(): Promise<boolean> {
  return (await ffmpeg()) !== null;
}

/** Length in seconds, read from ffmpeg's own report of the file. */
export async function videoDuration(file: string): Promise<number | null> {
  const bin = await ffmpeg();
  if (!bin) return null;
  // With no output file ffmpeg exits non-zero, but still prints the header.
  const stderr = await run(bin, ["-hide_banner", "-i", file], { timeout: 30_000 }).then(
    (r) => r.stderr,
    (error: { stderr?: string }) => error.stderr ?? "",
  );
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/** One JPEG still at `seconds`, at most 1280px wide. Null when it cannot be read. */
export async function grabFrame(file: string, seconds: number): Promise<Buffer | null> {
  const bin = await ffmpeg();
  if (!bin) return null;
  const out = path.join(os.tmpdir(), `comic-frame-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  try {
    await run(
      bin,
      [
        "-v", "error", "-y",
        "-ss", Math.max(seconds, 0).toFixed(2),
        "-i", file,
        "-frames:v", "1",
        "-vf", "scale='min(1280,iw)':-2",
        "-q:v", "3",
        out,
      ],
      { timeout: 45_000 },
    );
    return await readFile(out);
  } catch {
    return null;
  } finally {
    await rm(out, { force: true });
  }
}
