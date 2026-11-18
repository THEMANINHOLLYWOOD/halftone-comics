"use client";

import { BUILD_STEPS, buildStage } from "@/lib/live/build";
import type { Comic } from "@/lib/types";
import { SuperCursor } from "./SuperCursor";

/** A comic being made, shown as a little studio: five steps and the hero at work on the current one. */
export function BuildLine({ comic }: { comic: Comic }) {
  const total = comic.pages.length;
  const done = comic.pages.filter((p) => p.status !== "pending").length;
  const stage = buildStage(comic.progress, done, total);
  return (
    <div className="pointer-events-auto flex flex-col items-center gap-1.5" role="status" aria-live="polite">
      <div className="flex items-end gap-2">
        <span className="-mb-1">
          <SuperCursor hero={stage.hero} state="rest" size={36} />
        </span>
        <ol className="flex items-center gap-1">
          {BUILD_STEPS.map((name, i) => (
            <li
              key={name}
              className={`flex h-6 items-center rounded-full px-2 font-mono text-[9.5px] uppercase tracking-[0.12em] transition-colors ${
                i < stage.step ? "bg-ink/10 text-ink" : i === stage.step ? "bg-ink text-paper" : "text-mute ring-1 ring-line"
              }`}
            >
              {i < stage.step ? "✓ " : ""}
              {name}
            </li>
          ))}
        </ol>
      </div>
      <p className="text-[12.5px]">
        {stage.line}
        <span className="build-dots" aria-hidden />
      </p>
    </div>
  );
}
