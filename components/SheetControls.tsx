"use client";

import { useState, type Ref } from "react";
import { pageLabel } from "@/lib/client";
import { getEra } from "@/lib/eras";
import type { Comic, ComicPage } from "@/lib/types";
import { BuildLine } from "./live/BuildLine";
import { IconClose, IconEdit, IconFlip, IconMore, IconNext, IconPrev, IconRead, IconSave, IconSend, IconShare, IconUndo, IconView } from "./icons";

export interface MoreAction {
  label: string;
  onClick(): void;
  tone?: "accent";
}

interface Props {
  ref?: Ref<HTMLElement>;
  comic: Comic;
  page: ComicPage | undefined;
  reading: boolean;
  readable: boolean;
  notice: string | null;
  canPrev: boolean;
  canNext: boolean;
  onPrev(): void;
  onNext(): void;
  onFlip(): void;
  onRead(): void;
  onView?: () => void;
  saveHref?: string;
  onShare(): void;
  /** Draw the eye to Share: the visitor's own comic just finished. */
  shareGlow: boolean;
  more: MoreAction[];
  /** Reading a two-page spread: which open page the actions are for. */
  spread?: { left: string; right: string; side: 0 | 1; onSide(side: 0 | 1): void };
  /** A finished single: offer to add photos and turn it into a book. */
  grow?: () => void;
  /** Change this page: the icons give way to a prompt bar. */
  onEdit?: () => void;
  edit: null | {
    /** Admin only: model chips shown above the bar. */
    extra?: React.ReactNode;
    text: string;
    marks: number;
    sending: boolean;
    onText(text: string): void;
    onUndo(): void;
    onSend(): void;
    onCancel(): void;
  };
  removing: boolean;
  onConfirmRemove(): void;
  onCancelRemove(): void;
  /** The tick scrubber: one entry per sheet (or per comic on the shelf). */
  ticks: string[];
  current: number;
  onTick(index: number): void;
}

const quiet = "font-mono text-[10.5px] uppercase tracking-[0.16em]";
const icon =
  "grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink transition-colors hover:bg-ink/5 disabled:pointer-events-none disabled:opacity-25";

export function SheetControls({ ref, ...props }: Props) {
  const { comic, page, reading, readable, notice, more } = props;
  const [moreOpen, setMoreOpen] = useState(false);
  const era = getEra(comic.era);
  const busy = comic.status === "generating";

  return (
    <footer
      ref={ref}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-1.5 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center sm:gap-2 sm:px-6 sm:pb-5"
    >
      {notice && (
        <p className="pointer-events-auto max-w-md text-[12.5px] text-accent" role="status">
          {notice}
        </p>
      )}

      <div className="w-full max-w-xl">
        <h1 className="truncate font-display text-[20px] leading-tight uppercase tracking-wide sm:text-[22px]">
          {comic.title}
        </h1>
        {props.spread ? (
          <p className={`${quiet} mt-0.5 flex items-center justify-center gap-1 text-mute`}>
            <span className="truncate">{era.name} · No. {comic.issue ?? 1} ·</span>
            {([0, 1] as const).map((side) => (
              <button
                key={side}
                type="button"
                aria-pressed={props.spread!.side === side}
                onClick={() => props.spread!.onSide(side)}
                className={`pointer-events-auto h-7 rounded-full px-2 ${props.spread!.side === side ? "bg-ink text-paper" : "hover:text-ink"}`}
              >
                {side === 0 ? props.spread!.left : props.spread!.right}
              </button>
            ))}
          </p>
        ) : (
          <p className={`${quiet} mt-0.5 truncate text-mute`}>
            {era.name} · No. {comic.issue ?? 1} · {pageLabel(comic, page)}
          </p>
        )}
      </div>

      {busy && <BuildLine comic={comic} />}
      {comic.status === "failed" && (
        <p className="line-clamp-2 max-w-md text-[12.5px] leading-snug text-accent" role="alert">
          {comic.error ?? "This comic could not be made."}
        </p>
      )}
      {comic.status !== "failed" && page?.status === "failed" && (
        <p className="line-clamp-2 max-w-md text-[12.5px] leading-snug text-accent" role="alert">
          {page.error ?? "This page could not be drawn."}
        </p>
      )}

      {props.grow && !props.removing && (
        <button
          type="button"
          onClick={props.grow}
          className="pointer-events-auto flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-[13px] text-paper shadow-[0_8px_20px_-10px_rgb(0_0_0/0.6)] transition-transform hover:scale-[1.03] active:scale-95"
        >
          <span className="font-display text-[15px] leading-none tracking-wide">+</span>
          Add photos to make it a book
        </button>
      )}

      {props.edit?.extra && <div className="pointer-events-auto w-full max-w-xl rounded-2xl bg-paper/95 px-3 py-2 ring-1 ring-line">{props.edit.extra}</div>}
      {props.edit ? (
        <form
          className="edit-bar pointer-events-auto flex w-full max-w-xl items-center gap-1.5 rounded-full bg-paper p-1.5 shadow-[0_14px_40px_-18px_rgb(0_0_0/0.5)] ring-1 ring-line"
          onSubmit={(event) => {
            event.preventDefault();
            props.edit?.onSend();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") props.edit?.onCancel();
            event.stopPropagation();
          }}
        >
          <button type="button" onClick={props.edit.onCancel} aria-label="Stop editing" title="Stop editing" className={icon}>
            <IconClose size={18} />
          </button>
          <input
            autoFocus
            value={props.edit.text}
            onChange={(event) => props.edit?.onText(event.target.value)}
            placeholder={props.edit.marks ? "What should change there?" : "What should change?"}
            aria-label="What should change"
            maxLength={1000}
            data-keep-paste
            className="h-11 min-w-0 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-mute sm:text-[15px]"
          />
          {props.edit.marks > 0 && (
            <button type="button" onClick={props.edit.onUndo} aria-label="Undo the last mark" title="Undo the last mark" className={`${icon} relative`}>
              <IconUndo size={18} />
              <span className="absolute top-1.5 right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 font-mono text-[9px] text-paper">
                {props.edit.marks}
              </span>
            </button>
          )}
          <button
            type="submit"
            disabled={!props.edit.text.trim() || props.edit.sending}
            aria-label="Redraw with this change"
            title="Redraw with this change"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-paper transition-opacity disabled:opacity-30"
          >
            <IconSend size={18} />
          </button>
        </form>
      ) : props.removing ? (
        <div className="pointer-events-auto flex items-center justify-center gap-2 py-1.5">
          <span className={`${quiet} px-2 text-ink`}>Remove this comic?</span>
          <button
            type="button"
            onClick={props.onConfirmRemove}
            className={`${quiet} h-11 rounded-full px-4 text-accent hover:bg-accent/10`}
          >
            Remove
          </button>
          <button type="button" onClick={props.onCancelRemove} className={`${quiet} h-11 rounded-full px-4 text-mute hover:bg-ink/5`}>
            Keep
          </button>
        </div>
      ) : (
        <div className="pointer-events-auto flex items-center justify-center gap-0.5 sm:gap-1">
          <button type="button" onClick={props.onPrev} disabled={!props.canPrev} aria-label="Previous" title="Previous" className={icon}>
            <IconPrev />
          </button>
          {!reading && readable && comic.status !== "failed" && (
            <button type="button" onClick={props.onRead} aria-label="Read" title="Read" className={icon}>
              <IconRead />
            </button>
          )}
          {!reading && (
            <button type="button" onClick={props.onFlip} aria-label="Flip" title="Flip" className={icon}>
              <IconFlip />
            </button>
          )}
          {props.onView && (
            <button type="button" onClick={props.onView} aria-label="View full size" title="View full size" className={icon}>
              <IconView />
            </button>
          )}
          {props.saveHref && (
            <a href={props.saveHref} download aria-label="Save this page" title="Save this page" className={icon}>
              <IconSave />
            </a>
          )}
          {props.onEdit && (
            <button type="button" onClick={props.onEdit} aria-label="Change this page" title="Change this page" className={icon}>
              <IconEdit />
            </button>
          )}
          {!busy && comic.status !== "failed" && (
            <button
              type="button"
              onClick={props.onShare}
              aria-label="Share"
              title="Share"
              className={`${icon} ${props.shareGlow ? "share-glow" : ""}`}
            >
              <IconShare />
            </button>
          )}
          {more.length > 0 && (
            <div className="relative">
              <button
                type="button"
                aria-label="More"
                title="More"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((value) => !value)}
                className={`${icon} ${moreOpen ? "bg-ink/5" : ""}`}
              >
                <IconMore />
              </button>
              {moreOpen && (
                <>
                  <div aria-hidden className="fixed inset-0 z-[9]" onClick={() => setMoreOpen(false)} />
                  <div className="absolute bottom-full left-1/2 z-10 mb-2 flex w-52 -translate-x-1/2 flex-col rounded-xl bg-paper p-1.5 text-left shadow-lg ring-1 ring-line">
                    {more.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          setMoreOpen(false);
                          item.onClick();
                        }}
                        className={`flex h-11 items-center rounded-lg px-3 text-[13.5px] hover:bg-ink/5 ${item.tone === "accent" ? "text-accent" : ""}`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <button type="button" onClick={props.onNext} disabled={!props.canNext} aria-label="Next" title="Next" className={icon}>
            <IconNext />
          </button>
        </div>
      )}

      <nav
        aria-label={reading ? "Sheets in this comic" : "Comics"}
        className="pointer-events-auto flex h-5 max-w-full items-end justify-center overflow-hidden"
      >
        {props.ticks.map((label, i) => (
          <button
            key={`${i}-${label}`}
            type="button"
            aria-label={label}
            aria-current={i === props.current}
            onClick={() => props.onTick(i)}
            className="group flex h-5 shrink-0 items-end justify-center"
            style={{ width: props.ticks.length > 50 ? 4 : 6 }}
          >
            <span
              className={`w-px transition-all ${i === props.current ? "h-3.5 bg-ink" : "h-2 bg-ink/25 group-hover:h-3 group-hover:bg-ink/60"}`}
            />
          </button>
        ))}
      </nav>
    </footer>
  );
}
