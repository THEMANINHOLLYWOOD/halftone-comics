"use client";

import { useState } from "react";
import { ARTISTS } from "@/lib/artists";

interface Props {
  /** Chosen model ids; more than one draws the same thing once per model, to compare. */
  value: string[];
  onChange(ids: string[]): void;
  multiple?: boolean;
}

/** Admin only: which image models draw. Visitors never see this. */
export function AdminModels({ value, onChange, multiple = true }: Props) {
  const [all, setAll] = useState(false);
  const shown = all ? ARTISTS : ARTISTS.filter((a) => a.featured || value.includes(a.id));
  const toggle = (id: string) => {
    if (!multiple) return onChange([id]);
    const next = value.includes(id) ? value.filter((v) => v !== id) : [...value, id];
    onChange(next.length ? next : [id]);
  };
  return (
    <div className="-mx-1 flex flex-wrap gap-1">
      {shown.map((artist) => (
        <button
          key={artist.id}
          type="button"
          aria-pressed={value.includes(artist.id)}
          onClick={() => toggle(artist.id)}
          className={`h-8 rounded-full border px-2.5 font-mono text-[10.5px] ${value.includes(artist.id) ? "border-ink bg-ink text-paper" : "border-line text-mute hover:border-mute hover:text-ink"}`}
        >
          {artist.name}
        </button>
      ))}
      <button type="button" onClick={() => setAll((v) => !v)} className="h-8 rounded-full px-2.5 font-mono text-[10.5px] text-mute underline-offset-2 hover:underline">
        {all ? "Fewer" : `All ${ARTISTS.length}`}
      </button>
    </div>
  );
}
