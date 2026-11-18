"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { api } from "@/lib/client";
import { DEFAULT_ERA, ERAS, getEra } from "@/lib/eras";
import { autoStartArmed, COUNTDOWN_MS } from "@/lib/tray";
import { DEFAULT_ARTIST } from "@/lib/artists";
import { markMade } from "@/lib/local";
import { useSession } from "@/lib/session";
import { upsertComic } from "@/lib/store";
import { asLink, kindOf, sendToBlob, sendToServer } from "@/lib/uploads";
import type { Comic, StudioInfo, UploadRef } from "@/lib/types";
import { AdminModels } from "./AdminModels";
import { IconClose, IconPlus } from "./icons";

interface Attachment {
  key: string;
  file: File;
  preview?: string;
  progress: number;
  upload?: UploadRef;
  error?: string;
}

export interface MakeTrayHandle {
  /** Open the tray and the file picker, inside the tap that asked for it. */
  pick(): void;
  /** The same, but what is added becomes more pages of this comic. */
  extend(comic: Pick<Comic, "id" | "title">): void;
}

interface Props {
  ref?: Ref<MakeTrayHandle>;
  open: boolean;
  info: StudioInfo;
  onOpen(): void;
  onClose(): void;
  onStarted(comic: Comic): void;
}

const PAGE_CHOICES = [0, 2, 4, 6, 8, 10, 12];
const quiet = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-mute";
const field =
  "w-full rounded-lg border border-line bg-white/70 px-3 py-2 text-base outline-none placeholder:text-mute focus:border-ink sm:text-[14px]";

/** A thin ring that fills as a file uploads. */
function ProgressRing({ value }: { value: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 24 24" className="absolute inset-0 m-auto h-7 w-7 -rotate-90" aria-hidden>
      <circle cx="12" cy="12" r={r} fill="none" stroke="rgb(255 255 255 / 0.55)" strokeWidth="3" />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke="white"
        strokeWidth="3"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value)}
        className="transition-[stroke-dashoffset] duration-200"
      />
    </svg>
  );
}

export function MakeTray({ ref, open, info, onOpen, onClose, onStarted }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  const [linkPasted, setLinkPasted] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [title, setTitle] = useState("");
  const [story, setStory] = useState("");
  const [era, setEra] = useState(DEFAULT_ERA);
  const [pages, setPages] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { admin } = useSession();
  /** Admin only: the models to draw with; more than one makes one comic per model. */
  const [models, setModels] = useState<string[]>([DEFAULT_ARTIST]);
  /** Adding pages to this comic instead of making a new one. */
  const [target, setTarget] = useState<Pick<Comic, "id" | "title"> | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    pick() {
      setTarget(null);
      onOpen();
      picker.current?.click();
    },
    extend(comic) {
      setTarget({ id: comic.id, title: comic.title });
      onOpen();
      picker.current?.click();
    },
  }));

  const patch = useCallback((key: string, change: Partial<Attachment>) => {
    setAttachments((list) => list.map((a) => (a.key === key ? { ...a, ...change } : a)));
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      const fresh = files.slice(0, 12).map(
        (file): Attachment => ({
          key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
          file,
          preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
          progress: 0,
        }),
      );
      if (!fresh.length) return;
      setError(null);
      setAttachments((list) => [...list, ...fresh].slice(0, 12));
      onOpen();
      const send = info.storage === "blob" ? sendToBlob : sendToServer;
      for (const item of fresh) {
        send(item.file, (progress) => patch(item.key, { progress }))
          .then((upload) => patch(item.key, { upload, progress: 1 }))
          .catch((failure: Error) => patch(item.key, { error: failure.message }));
      }
    },
    [patch, info.storage, onOpen],
  );

  const addLink = useCallback(
    (value: string, pasted: boolean): boolean => {
      const link = asLink(value);
      if (!link) return false;
      setLinks((list) => (list.includes(link) ? list : [...list, link].slice(0, 6)));
      if (pasted) setLinkPasted(true);
      onOpen();
      return true;
    },
    [onOpen],
  );

  // Files can be dropped anywhere on the page, whether or not the tray is up.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth += 1;
      setDragging(true);
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(depth - 1, 0);
      if (!depth) setDragging(false);
    };
    const over = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      addFiles([...(event.dataTransfer?.files ?? [])]);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [addFiles]);

  // Pasting a picture anywhere attaches it; pasting a link outside a text box adds it.
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-keep-paste]")) return;
      const files = [...(event.clipboardData?.files ?? [])];
      if (files.length) {
        event.preventDefault();
        addFiles(files);
        return;
      }
      const typing = target?.tagName === "TEXTAREA" || target?.tagName === "INPUT";
      if (!typing && addLink(event.clipboardData?.getData("text") ?? "", true)) event.preventDefault();
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [addFiles, addLink]);

  const reset = () => {
    for (const a of attachments) if (a.preview) URL.revokeObjectURL(a.preview);
    setAttachments([]);
    setLinks([]);
    setLinkPasted(false);
    setLinkDraft("");
    setTitle("");
    setStory("");
    setDetailsOpen(false);
    setError(null);
    setTarget(null);
  };

  const dismiss = () => {
    reset();
    onClose();
  };

  const removeFile = (key: string) => {
    setAttachments((list) => {
      const gone = list.find((a) => a.key === key);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return list.filter((a) => a.key !== key);
    });
  };

  const uploading = attachments.some((a) => !a.upload && !a.error);
  const ready = attachments.filter((a) => a.upload);
  const draftLink = asLink(linkDraft);
  const hasMaterial = !!title.trim() || !!story.trim() || ready.length > 0 || links.length > 0 || !!draftLink;
  const canMake = hasMaterial && !uploading && !busy && info.hasKey;
  const armed =
    info.hasKey &&
    autoStartArmed({
      files: attachments.map((a) => ({ done: !!a.upload, failed: !!a.error })),
      links: links.length,
      linkPasted,
      title,
      story: story + linkDraft,
      detailsOpen,
      busy,
      failed: !!error,
    });

  const submit = async () => {
    if (!canMake) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        prompt: story,
        title: title.trim() || undefined,
        era,
        pages,
        uploads: ready.map((a) => a.upload!),
        links: draftLink && !links.includes(draftLink) ? [...links, draftLink] : links,
      };
      const runs = admin && !target ? models : [undefined];
      const made = await Promise.all(
        runs.map((artist) =>
          api<{ comic: Comic }>(target ? `/api/comics/${target.id}/extend` : "/api/generate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...body, artist }),
          }),
        ),
      );
      for (const { comic: each } of made) markMade(each.id);
      for (const { comic: each } of made.slice(1)) upsertComic(each);
      const { comic } = made[0];
      reset();
      onStarted(comic);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // The countdown: armed for COUNTDOWN_MS without interruption starts the comic.
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });
  const fileCount = attachments.length + links.length;
  // Keyed on the material, so the fill restarts whenever more arrives.
  const countdownKey = armed ? String(fileCount) : null;
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => void submitRef.current(), COUNTDOWN_MS);
    return () => clearTimeout(timer);
    // Adding material restarts the count.
  }, [armed, fileCount]);

  const visible = open || attachments.length > 0 || links.length > 0;
  const chosen = getEra(era);

  return (
    <>
      {dragging && (
        <div className="pointer-events-none fixed inset-3 z-50 grid place-items-center rounded-3xl border-2 border-dashed border-ink/60 bg-stage/80 backdrop-blur-sm">
          <p className="font-display text-4xl uppercase tracking-wide">Drop it in</p>
        </div>
      )}

      <input
        ref={picker}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          addFiles([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />

      <section
        role="dialog"
        aria-label="Make a comic"
        aria-hidden={!visible}
        inert={!visible}
        onKeyDown={(event) => {
          if (event.key === "Escape") dismiss();
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit();
          // Typing here should never turn pages on the stage behind.
          event.stopPropagation();
        }}
        className={`fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-[transform,opacity] duration-300 ease-out sm:px-5 sm:pb-5 ${visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"}`}
      >
        <div className="w-full max-w-[560px] rounded-2xl bg-paper/95 shadow-[0_18px_50px_-20px_rgb(0_0_0/0.35)] ring-1 ring-line backdrop-blur">
          {detailsOpen && (
            <div className="max-h-[52dvh] space-y-5 overflow-y-auto overscroll-contain border-b border-line px-4 pt-4 pb-5">
              <label className="block">
                <span className={quiet}>Story</span>
                <textarea
                  value={story}
                  onChange={(event) => setStory(event.target.value)}
                  rows={3}
                  placeholder="What happens? Who is in it? Leave it empty to let your files speak."
                  className={`${field} mt-2 resize-none leading-relaxed`}
                />
              </label>

              <div>
                <span className={quiet}>Links</span>
                <form
                  className="mt-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (addLink(linkDraft, false)) setLinkDraft("");
                  }}
                >
                  <input
                    value={linkDraft}
                    onChange={(event) => setLinkDraft(event.target.value)}
                    placeholder="Paste a link: article, video, image…"
                    aria-label="Add a link"
                    className={field}
                  />
                </form>
                {links.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {links.map((link) => (
                      <li key={link} className="flex items-center gap-2 font-mono text-[11px] text-mute">
                        <span className="min-w-0 flex-1 truncate">{link.replace(/^https?:\/\//, "")}</span>
                        <button
                          type="button"
                          aria-label="Remove link"
                          title="Remove link"
                          onClick={() => setLinks((list) => list.filter((l) => l !== link))}
                          className="grid h-8 w-8 place-items-center rounded-full hover:bg-ink/5 hover:text-ink"
                        >
                          <IconClose size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <span className={quiet}>Era · {chosen.years}</span>
                <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1">
                  {ERAS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={option.id === era}
                      onClick={() => setEra(option.id)}
                      className={`flex h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-[13px] transition-colors ${option.id === era ? "border-ink bg-white" : "border-line hover:border-mute"}`}
                    >
                      <span className="flex -space-x-1" aria-hidden>
                        {option.swatch.map((colour) => (
                          <span key={colour} className="h-3 w-3 rounded-full border border-paper" style={{ background: colour }} />
                        ))}
                      </span>
                      {option.name}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-mute">{chosen.blurb}</p>
              </div>

              {admin && !target && (
                <div>
                  <span className={quiet}>Models · admin{models.length > 1 ? ` · ${models.length} comics` : ""}</span>
                  <div className="mt-2">
                    <AdminModels value={models} onChange={setModels} />
                  </div>
                </div>
              )}

              <div>
                <span className={quiet}>Pages</span>
                <div className="mt-2 flex flex-wrap gap-1">
                  {PAGE_CHOICES.map((count) => (
                    <button
                      key={count}
                      type="button"
                      aria-pressed={pages === count}
                      onClick={() => setPages(count)}
                      className={`h-10 min-w-10 rounded-full border px-3 font-mono text-[12px] ${pages === count ? "border-ink bg-ink text-paper" : "border-line hover:border-mute"}`}
                    >
                      {count === 0 ? "Auto" : count}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          )}

          {target && (
            <p className="flex items-center gap-2 px-4 pt-3 text-[13px]">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-mute">Adding pages to</span>
              <span className="min-w-0 truncate font-medium">{target.title}</span>
            </p>
          )}

          {(error || !info.hasKey) && (
            <p className="px-4 pt-3 text-[13px] leading-snug text-accent" role="alert">
              {error ?? "This server cannot draw right now."}
            </p>
          )}

          <div className="flex items-center gap-2 p-2.5 sm:gap-2.5">
            <div className="flex max-w-[45%] shrink-0 gap-1.5 overflow-x-auto">
              {attachments.length === 0 && (
                <button
                  type="button"
                  onClick={() => picker.current?.click()}
                  aria-label="Choose files"
                  title="Choose files"
                  className="grid h-11 w-11 place-items-center rounded-xl border border-dashed border-line text-mute hover:border-ink hover:text-ink"
                >
                  <IconPlus size={18} />
                </button>
              )}
              {attachments.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => removeFile(a.key)}
                  aria-label={`Remove ${a.file.name}`}
                  title={a.error ?? a.file.name}
                  className={`group relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-ink/5 ring-1 ${a.error ? "ring-accent" : "ring-line"}`}
                >
                  {a.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a local blob preview, nothing to optimise
                    <img src={a.preview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full place-items-center font-mono text-[9px] uppercase text-mute">{kindOf(a.file)}</span>
                  )}
                  {!a.upload && !a.error && (
                    <span className="absolute inset-0 bg-ink/35">
                      <ProgressRing value={a.progress} />
                    </span>
                  )}
                  <span className="absolute inset-0 hidden place-items-center bg-ink/45 text-white group-hover:grid">
                    <IconClose size={14} />
                  </span>
                </button>
              ))}
            </div>

            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Title (optional)"
              aria-label="Title"
              maxLength={60}
              data-keep-paste
              className="h-11 min-w-0 flex-1 rounded-xl bg-transparent px-2 text-base outline-none placeholder:text-mute sm:text-[15px]"
            />

            <button
              type="button"
              onClick={() => setDetailsOpen((value) => !value)}
              aria-expanded={detailsOpen}
              aria-label={detailsOpen ? "Hide details" : "Add details"}
              title={detailsOpen ? "Hide details" : "Add details"}
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ring-1 transition-colors ${detailsOpen ? "bg-ink text-paper ring-ink" : "ring-line hover:bg-ink/5"}`}
            >
              <IconPlus size={18} />
            </button>

            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canMake}
              className="relative h-11 shrink-0 overflow-hidden rounded-full bg-ink px-5 font-mono text-[11px] uppercase tracking-[0.16em] text-paper transition-opacity disabled:opacity-35"
            >
              {countdownKey !== null && (
                <span
                  key={countdownKey}
                  aria-hidden
                  className="countdown absolute inset-y-0 left-0 bg-white/20"
                  style={{ animationDuration: `${COUNTDOWN_MS}ms` }}
                />
              )}
              <span className="relative">{busy ? "Starting" : uploading ? "Sending" : "Make"}</span>
            </button>

            <button
              type="button"
              onClick={dismiss}
              aria-label="Close"
              title="Close"
              className="-ml-1 grid h-11 w-9 shrink-0 place-items-center rounded-full text-mute hover:text-ink"
            >
              <IconClose size={16} />
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
