"use client";

import { useState } from "react";
import { ARTISTS, artistRoutes, getArtist, MODEL_ID, ROUTE_LABEL } from "@/lib/artists";
import type { StudioInfo } from "@/lib/types";

interface Props {
  value: string;
  onChange(id: string): void;
  keys: StudioInfo["keys"];
}

/**
 * Choose the image model a comic (or one sheet) is drawn with. The featured
 * few come first; the rest, and any AI Gateway model id, are one tap away.
 */
export function ArtistPicker({ value, onChange, keys }: Props) {
  const current = getArtist(value);
  const curated = ARTISTS.some((a) => a.id === value);
  const [showAll, setShowAll] = useState(!ARTISTS.find((a) => a.id === value)?.featured);
  const [custom, setCustom] = useState(curated ? "" : value);
  const shown = showAll ? ARTISTS : ARTISTS.filter((a) => a.featured);

  const badge = (id: string) => {
    const route = artistRoutes(getArtist(id), keys)[0];
    return (
      <span
        className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider ${route === "gateway" ? "bg-ink/5 text-mute" : "bg-emerald-600/10 text-emerald-800"}`}
      >
        {ROUTE_LABEL[route]}
      </span>
    );
  };

  return (
    <div>
      <ul className="space-y-1.5">
        {shown.map((artist) => {
          const on = artist.id === value;
          return (
            <li key={artist.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onChange(artist.id)}
                className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${on ? "border-ink bg-white" : "border-line hover:border-mute"}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[13px] font-medium">
                    {artist.name} <span className="font-normal text-mute">· {artist.maker}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[10.5px] text-mute">{artist.price}</span>
                </span>
                <span className="mt-0.5 flex items-start justify-between gap-2">
                  <span className="text-[12px] leading-snug text-mute">{artist.note}</span>
                  {badge(artist.id)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => setShowAll((v) => !v)}
        className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-mute underline-offset-4 hover:text-ink hover:underline"
      >
        {showAll ? "Fewer artists" : `All ${ARTISTS.length} artists`}
      </button>

      {showAll && (
        <form
          className="mt-3"
          onSubmit={(event) => {
            event.preventDefault();
            const id = custom.trim().toLowerCase();
            if (MODEL_ID.test(id)) onChange(id);
          }}
        >
          <label htmlFor="custom-model" className="text-[12px] text-mute">
            Or any AI Gateway image model id
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="custom-model"
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              placeholder="maker/model, e.g. bfl/flux-2-max"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-md border border-line bg-white/60 px-3 py-2 font-mono text-base outline-none placeholder:text-mute focus:border-ink sm:text-[12px]"
            />
            <button
              type="submit"
              disabled={!MODEL_ID.test(custom.trim().toLowerCase())}
              className="rounded-md border border-ink px-3 font-mono text-[11px] uppercase tracking-[0.14em] disabled:opacity-30"
            >
              Use
            </button>
          </div>
          {!curated && (
            <p className="mt-1.5 flex items-center gap-2 text-[12px] text-mute">
              Using <span className="font-mono text-ink">{current.id}</span> {badge(current.id)}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
