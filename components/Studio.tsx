"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  api,
  downloadUrl,
  getPasscode,
  leafSheets,
  pageLabel,
  pageUrl,
  PasscodeError,
  setPasscode,
  shelfSheets,
  type SheetWidth,
} from "@/lib/client";
import { getEra } from "@/lib/eras";
import { isMade, isOpened, markOpened } from "@/lib/local";
import { heroBy, randomHero, type HeroId } from "@/lib/live/heroes";
import { isSuitUpTap } from "@/lib/live/suit";
import { joinPlace } from "@/lib/live/presence";
import { useSession } from "@/lib/session";
import { comicPath, parseComicPath, shareComic } from "@/lib/share";
import { dropComic, refreshLibrary, upsertComic, useLibrary } from "@/lib/store";
import type { Mark } from "@/lib/marks";
import type { Stage } from "@/lib/stage/engine";
import { bookLayoutFor, normalise, stepBook, type BookLayout } from "@/lib/stage/view";
import type { Comic } from "@/lib/types";
import { AccountLine } from "./AccountLine";
import { HeroLayer } from "./live/HeroLayer";
import { PresenceStack } from "./live/PresenceStack";
import { AdminModels } from "./AdminModels";
import { IconBack, IconClose, IconGrid, IconPlus } from "./icons";
import { MakeTray, type MakeTrayHandle } from "./MakeTray";
import { MarkLayer } from "./MarkLayer";
import { PageViewer } from "./PageViewer";
import { SheetControls, type MoreAction } from "./SheetControls";
import { StageCanvas } from "./StageCanvas";

const quiet = "font-mono text-[10.5px] uppercase tracking-[0.16em]";
const round =
  "grid h-11 w-11 place-items-center rounded-full text-ink transition-colors hover:bg-ink/5";

const noSubscribe = () => () => {};

/** The hero you arrive as: dealt at random each time you come, never chosen. */
let arrivalHeroId: HeroId | null = null;
function arrivalHero(): HeroId {
  arrivalHeroId ||= randomHero();
  return arrivalHeroId;
}

/** This tab, as one person in a live room: made once, in the browser. */
let tabId = "";
function tabSession(): string {
  tabId ||= crypto.randomUUID();
  return tabId;
}

function subscribeResize(callback: () => void) {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}

/** The smallest stored size that still looks sharp at the sheet's size on this screen. */
function sheetWidthNow(): SheetWidth {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const css = Math.min(w * (Math.min(w, h) < 640 ? 0.8 : 0.62), ((h - 220) * 0.94) / 1.5);
  return css * Math.min(window.devicePixelRatio || 1, 2) > 700 ? 1280 : 640;
}

/** Live height of an element, for laying the stage out around it. */
function useHeight<T extends HTMLElement>(): [(node: T | null) => void, number] {
  const [height, setHeight] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((node: T | null) => {
    observer.current?.disconnect();
    if (!node) {
      setHeight(0);
      return;
    }
    observer.current = new ResizeObserver(() => setHeight(node.getBoundingClientRect().height));
    observer.current.observe(node);
  }, []);
  return [ref, height];
}

export function Studio({ initialId }: { initialId?: string } = {}) {
  const { comics, info, error: loadError } = useLibrary();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shelfFace, setShelfFace] = useState<0 | 1>(0);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [leaf, setLeaf] = useState(0);
  const [leafFace, setLeafFace] = useState<0 | 1>(0);
  const [composing, setComposing] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** An action waiting for the studio passcode. */
  const [pending, setPending] = useState<{ run: () => Promise<void>; error?: string } | null>(null);

  const sheetWidth = useSyncExternalStore(subscribeResize, sheetWidthNow, () => 1280 as SheetWidth);
  // Reading: two pages at once on wide screens, one at a time on phones.
  const layout = useSyncExternalStore<BookLayout>(subscribeResize, () => bookLayoutFor(window.innerWidth, window.innerHeight), () => "spread");
  const [headerRef, headerHeight] = useHeight<HTMLElement>();
  const [footerRef, footerHeight] = useHeight<HTMLElement>();
  const tray = useRef<MakeTrayHandle>(null);
  const stage = useRef<Stage | null>(null);
  const onStage = useCallback((made: Stage | null) => {
    stage.current = made;
  }, []);
  const sheetRect = useCallback(() => stage.current?.sheetRect() ?? null, []);
  const getStage = useCallback(() => stage.current, []);
  // Heroes are chosen on the device, so they only appear once the page is running there.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  // Every tab is someone in the room: a session for this tab, and a hero dealt on arrival.
  const session = useSyncExternalStore(noSubscribe, tabSession, () => "");
  const hero = useSyncExternalStore(noSubscribe, arrivalHero, () => "volt" as HeroId);
  /** You arrive as a dormant hero; your first press anywhere suits you up. After that, taps on the comic are powers. */
  const [suited, setSuited] = useState(false);
  const suitedAt = useRef<number | null>(null);
  useEffect(() => {
    if (suited) return;
    const suitUp = () => {
      suitedAt.current = performance.now();
      setSuited(true);
      window.dispatchEvent(new Event("hero-suit"));
    };
    window.addEventListener("pointerdown", suitUp, { capture: true, once: true });
    return () => window.removeEventListener("pointerdown", suitUp, { capture: true });
  }, [suited]);
  /** Changing the current page: a prompt, and marks drawn on it. */
  const [editing, setEditing] = useState(false);
  /** The page an edit was started on: a change is only ever sent to that page. */
  const [editTarget, setEditTarget] = useState<{ comicId: string; pageId: string } | null>(null);
  const [editText, setEditText] = useState("");
  const [marks, setMarks] = useState<Mark[]>([]);
  const [sending, setSending] = useState(false);
  const { admin } = useSession();
  const [editModel, setEditModel] = useState<string[]>([]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(timer);
  }, [notice]);

  const visible = useMemo(() => comics ?? [], [comics]);
  const reading = useMemo(() => comics?.find((c) => c.id === readingId) ?? null, [comics, readingId]);
  // Comics this device has never opened (and did not make) wait in their sealed bags.
  const [sealVersion, setSealVersion] = useState(0);
  const sheets = useMemo(
    () =>
      reading
        ? leafSheets(reading, sheetWidth)
        : shelfSheets(visible, sheetWidth, (c) => sealVersion >= 0 && c.status === "ready" && !isOpened(c.id) && !isMade(c.id)),
    [reading, visible, sheetWidth, sealVersion],
  );
  /** A comic to open as soon as its seal is broken. */
  const [openAfterSeal, setOpenAfterSeal] = useState<string | null>(null);

  const shelfIndex = Math.max(0, visible.findIndex((c) => c.id === selectedId));
  // A spread shows two faces as one view; rotating the phone keeps the same pages.
  const bookPos = normalise(sheets.length, { index: leaf, face: leafFace }, layout);
  const index = reading ? bookPos.index : shelfIndex;
  const face = reading ? bookPos.face : shelfFace;
  const comic = reading ?? visible[shelfIndex] ?? null;
  // In a spread both open pages are in view; the reader picks which one the page actions are for.
  const [spreadSide, setSpreadSide] = useState<0 | 1>(1);
  const turned = face === 0 ? index : index + 1;
  const spreadPages =
    reading && layout === "spread"
      ? { left: turned > 0 ? reading.pages[2 * (turned - 1) + 1] : undefined, right: reading.pages[2 * turned] }
      : null;
  const page = !comic
    ? undefined
    : spreadPages
      ? spreadSide === 1
        ? (spreadPages.right ?? spreadPages.left)
        : (spreadPages.left ?? spreadPages.right)
      : reading
        ? comic.pages[index * 2 + face]
        : face === 0
        ? (comic.pages.find((p) => p.kind === "cover") ?? comic.pages[0])
        : comic.pages.find((p) => p.kind === "back");
  // A single (front and back only) is flipped, not read.
  const readable = !!comic && comic.pages.some((p) => p.kind === "page");
  const isSingleDone = !!comic && comic.collection === "new" && comic.status === "ready" && !readable && !!comic.canRedraw;
  const pageImage = page?.status === "ready" ? pageUrl(page, 1280) : undefined;

  const onIndex = useCallback(
    (i: number, f: 0 | 1) => {
      setRemoving(false);
      // Moving to another page ends an edit: it belonged to the page it started on.
      setEditing(false);
      setEditTarget(null);
      if (reading) {
        setLeaf(i);
        setLeafFace(f);
      } else {
        setSelectedId(visible[i]?.id ?? null);
        setShelfFace(f);
      }
    },
    [reading, visible],
  );

  const onFace = useCallback(
    (_i: number, f: 0 | 1) => {
      if (reading) setLeafFace(f);
      else setShelfFace(f);
    },
    [reading],
  );

  const goTo = (i: number) => onIndex(i, 0);

  const canStep = (direction: 1 | -1): boolean => {
    if (!reading) return !!visible[shelfIndex + direction];
    return stepBook(sheets.length, bookPos, direction, layout) !== null;
  };

  /** Next or previous face: in a comic that means turning the sheet before moving on. */
  const step = (direction: 1 | -1) => {
    if (!canStep(direction)) return;
    if (!reading) {
      onIndex(shelfIndex + direction, 0);
      return;
    }
    const next = stepBook(sheets.length, bookPos, direction, layout);
    if (next) onIndex(next.index, next.face);
  };

  // Reading, "flip" turns the page; on the shelf it shows the other side.
  const flip = () => {
    if (reading) step(1);
    else setShelfFace(shelfFace === 0 ? 1 : 0);
  };

  const open = (target: Comic, push = true) => {
    // Still in its bag: peel the seal first; the comic opens once it has slid out.
    if (stage.current?.isSealed(target.id)) {
      setOpenAfterSeal(target.id);
      setSelectedId(target.id);
      stage.current.breakSeal(target.id);
      return;
    }
    setIndexOpen(false);
    setRemoving(false);
    setEditing(false);
    setEditTarget(null);
    setSelectedId(target.id);
    setReadingId(target.id);
    setLeaf(0);
    setLeafFace(0);
    // The cover swings open a beat after the book arrives.
    window.setTimeout(() => setLeafFace((now) => (now === 0 ? 1 : now)), 650);
    // Every open comic has its own address, so it can be copied and Back closes it.
    if (push && window.location.pathname !== comicPath(target.id)) window.history.pushState(null, "", comicPath(target.id));
  };

  const close = (push = true) => {
    setEditing(false);
    setEditTarget(null);
    if (reading) setSelectedId(reading.id);
    setShelfFace(0);
    setReadingId(null);
    setRemoving(false);
    setViewing(false);
    if (push && window.location.pathname !== "/") window.history.pushState(null, "", "/");
  };

  // The live room: the shelf, or the comic being read.
  const place = reading ? (`comic:${reading.id}` as const) : ("shelf" as const);
  useEffect(() => {
    if (!session) return;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    joinPlace(place, { session, hero, input: coarse ? "touch" : "mouse" });
  }, [place, session, hero]);

  /** A tap on the comic: the press that suited you up is only that; after it, your hero's power acts on the comic. */
  const heroTap = (dir: 1 | -1): boolean => {
    if (isSuitUpTap(suitedAt.current, performance.now())) return true;
    window.dispatchEvent(new Event("hero-power"));
    const power = heroBy(hero).power;
    // Any power opens a sealed comic; titan hands just look best doing it.
    if (!reading && comic && stage.current?.isSealed(comic.id)) {
      stage.current.breakSeal(comic.id);
      return true;
    }
    switch (power) {
      case "scan":
        if (pageImage) setViewing(true);
        else flip();
        break;
      case "portal":
        if (reading) close();
        else setIndexOpen(true);
        break;
      case "blast":
      case "dash":
      case "blink":
        step(dir);
        break;
      default:
        // strike, grab, rip: turn the page over (or flip the comic on the shelf)
        if (reading) step(dir);
        else flip();
    }
    return true;
  };

  // The latest of everything the window listeners below need.
  const keys = useRef({ step, flip, open, close, comic, comics, readable, reading, indexOpen, pageImage, editing, heroTap });
  useEffect(() => {
    keys.current = { step, flip, open, close, comic, comics, readable, reading, indexOpen, pageImage, editing, heroTap };
  });
  useEffect(() => {
    stage.current?.setTapHandler((tap) => keys.current.heroTap(tap.dir));
    return () => stage.current?.setTapHandler(null);
  });

  // A shared link (or Back / Forward) names a comic: open it, or select it when it is a single.
  const [arrived, setArrived] = useState(false);
  if (!arrived && comics && initialId) {
    setArrived(true);
    const target = comics.find((c) => c.id === initialId);
    if (target) {
      setSelectedId(target.id);
      const readable = target.pages.some((p) => p.kind === "page");
      // A shared comic arrives sealed: the visitor peels it, then it opens.
      if (readable && target.status === "ready" && !isOpened(target.id) && !isMade(target.id)) setOpenAfterSeal(target.id);
      else if (readable) setReadingId(target.id);
    }
  }
  useEffect(() => {
    const onPop = () => {
      const id = parseComicPath(window.location.pathname);
      const target = id ? keys.current.comics?.find((c) => c.id === id) : undefined;
      if (target?.pages.some((p) => p.kind === "page")) keys.current.open(target, false);
      else if (target) {
        keys.current.close(false);
        setSelectedId(target.id);
      } else keys.current.close(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /** Remove a comic, asking for the passcode first if needed. Making and redrawing are open to anyone. */
  const guarded = (run: () => Promise<void>) => {
    if (info.locked && !getPasscode()) {
      setPending({ run });
      return;
    }
    run().catch((error: Error) => {
      if (error instanceof PasscodeError) setPending({ run, error: error.message });
      else setNotice(error.message);
    });
  };

  const stopEditing = () => {
    setEditing(false);
    setEditTarget(null);
    setEditText("");
    setMarks([]);
  };

  const sendEdit = async () => {
    if (!editTarget || !editText.trim() || sending) return;
    setSending(true);
    try {
      const { comic: fresh } = await api<{ comic: Comic }>(`/api/comics/${editTarget.comicId}/pages/${editTarget.pageId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: editText.trim(), marks, artist: admin ? editModel[0] : undefined }),
      });
      upsertComic(fresh);
      stopEditing();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setSending(false);
    }
  };

  const startRedraw = async (kind: "page" | "missing") => {
    if (!comic || (kind === "page" && !page)) return;
    const url = kind === "page" ? `/api/comics/${comic.id}/pages/${page!.id}` : `/api/comics/${comic.id}/redraw`;
    try {
      const { comic: fresh } = await api<{ comic: Comic }>(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      upsertComic(fresh);
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const remove = () =>
    guarded(async () => {
      if (!comic) return;
      await api(`/api/comics/${comic.id}`, { method: "DELETE" });
      const neighbour = visible[shelfIndex + 1] ?? visible[shelfIndex - 1];
      setSelectedId(neighbour?.id ?? null);
      setReadingId(null);
      setRemoving(false);
      setNotice(`“${comic.title}” was removed.`);
      dropComic(comic.id);
    });

  const started = (fresh: Comic) => {
    setComposing(false);
    upsertComic(fresh);
    open(fresh);
  };

  const share = () => {
    if (!comic) return;
    void shareComic(comic).then((how) => {
      if (how === "copied") setNotice("Link copied");
    });
  };

  // Your own comic just finished: Share glows for a moment.
  const [glowId, setGlowId] = useState<string | null>(null);
  const [seen, setSeen] = useState(comics);
  if (seen !== comics) {
    setSeen(comics);
    const finished = (comics ?? []).find(
      (c) => c.status === "ready" && seen?.find((s) => s.id === c.id)?.status === "generating" && isMade(c.id),
    );
    if (finished) setGlowId(finished.id);
  }
  useEffect(() => {
    if (!glowId) return;
    const timer = setTimeout(() => setGlowId(null), 4000);
    return () => clearTimeout(timer);
  }, [glowId]);

  // Keyboard: arrows turn, space flips, enter opens, v views, escape steps back out.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [role=dialog]")) return;
      const k = keys.current;
      if (k.editing) return;
      const onButton = target?.tagName === "BUTTON" || target?.tagName === "A";
      switch (event.key) {
        case "ArrowRight":
          event.preventDefault();
          k.step(1);
          break;
        case "ArrowLeft":
          event.preventDefault();
          k.step(-1);
          break;
        case " ":
        case "f":
          if (onButton) return;
          event.preventDefault();
          k.flip();
          break;
        case "Enter":
          if (onButton) return;
          if (!k.reading && k.comic && k.readable) k.open(k.comic);
          break;
        case "v":
          if (k.pageImage) setViewing(true);
          break;
        case "Escape":
          if (k.indexOpen) setIndexOpen(false);
          else if (k.reading) k.close();
          break;
        case "n":
          tray.current?.pick();
          break;
        case "g":
          setIndexOpen((value) => !value);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const stageLabel = comic
    ? `${comic.title}, ${pageLabel(comic, page).toLowerCase()}. Drag to bend and flip the sheet.`
    : "Comic shelf";
  const isNew = comic?.collection === "new";
  const busy = comic?.status === "generating";
  const canDrawMissing = !!comic?.canRedraw && !busy && comic.pages.some((p) => p.status === "failed");
  const canRedraw = !!page && isNew && !!comic?.canRedraw && !busy;
  const saveHref = comic && page?.status === "ready" ? downloadUrl(comic, page) : undefined;
  const more: MoreAction[] = [
    ...(canDrawMissing
      ? [{ label: "Draw missing pages", onClick: () => void startRedraw("missing") }]
      : []),
    ...(canRedraw
      ? [{ label: "Redraw this page", onClick: () => void startRedraw("page") }]
      : []),
    ...(isNew && !busy ? [{ label: "Remove comic", tone: "accent" as const, onClick: () => setRemoving(true) }] : []),
  ];
  const viewDetail = page?.status === "ready" ? (page.caption ?? "") : "";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-stage">
      <StageCanvas
        sheets={sheets}
        turned={!!reading}
        index={index}
        face={face}
        label={stageLabel}
        editing={editing}
        onReady={onStage}
        insets={{ top: headerHeight, bottom: comic && !indexOpen ? footerHeight + 8 : 24 }}
        onIndex={onIndex}
        onFace={onFace}
        onSealBroken={(key) => {
          markOpened(key);
          setSealVersion((v) => v + 1);
          if (openAfterSeal === key) {
            setOpenAfterSeal(null);
            const target = comics?.find((c) => c.id === key);
            if (target?.pages.some((p) => p.kind === "page")) window.setTimeout(() => keys.current.open(target), 250);
          }
        }}
      />

      <header
        ref={headerRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-25 flex items-center justify-between gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 sm:px-6 sm:pt-5"
      >
        <div className="pointer-events-auto flex min-w-0 items-center">
          {reading && (
            <button type="button" onClick={() => close()} aria-label="Back to the shelf" title="Back to the shelf" className={round}>
              <IconBack />
            </button>
          )}
        </div>

        <div className="pointer-events-auto flex shrink-0 items-center gap-1">
          {mounted && <PresenceStack hero={hero} />}
          {!reading && (comics?.length ?? 0) > 0 && (
            <button
              type="button"
              aria-pressed={indexOpen}
              aria-label={indexOpen ? "Close the index" : "All comics"}
              title={indexOpen ? "Close the index" : "All comics"}
              onClick={() => setIndexOpen((value) => !value)}
              className={`${round} ${indexOpen ? "bg-ink/5" : ""}`}
            >
              {indexOpen ? <IconClose /> : <IconGrid />}
            </button>
          )}
          <button
            type="button"
            onClick={() => tray.current?.pick()}
            aria-label="Make a comic"
            title="Make a comic"
            className="grid h-11 w-11 place-items-center rounded-full bg-ink text-paper shadow-[0_6px_18px_-8px_rgb(0_0_0/0.6)] transition-transform hover:scale-105 active:scale-95"
          >
            <IconPlus />
          </button>
        </div>
      </header>

      {comics === null && !loadError && (
        <p className={`${quiet} absolute inset-0 grid place-items-center text-mute`}>Opening the shelf…</p>
      )}
      {loadError && comics === null && (
        <div className="absolute inset-0 grid place-items-center px-8 text-center">
          <div>
            <p className="text-sm">The shelf could not be opened: {loadError}</p>
            <button type="button" onClick={() => void refreshLibrary()} className={`${quiet} mt-3 h-11 px-3 text-mute hover:text-ink`}>
              Try again
            </button>
          </div>
        </div>
      )}
      {comics !== null && visible.length === 0 && !reading && (
        <button
          type="button"
          onClick={() => tray.current?.pick()}
          className="absolute inset-0 grid place-items-center px-8 text-center"
        >
          <span>
            <span className="block font-display text-[clamp(40px,9vw,72px)] leading-[0.95] uppercase tracking-wide">
              Anything can
              <br />
              be a comic
            </span>
            <span className="mt-3 block text-[14px] text-mute">Drop a photo, a video or a link anywhere, or tap +.</span>
          </span>
        </button>
      )}

      {comic && !indexOpen && (
        <SheetControls
          ref={footerRef}
          comic={comic}
          page={page}
          reading={!!reading}
          readable={readable}
          notice={notice}
          canPrev={canStep(-1)}
          canNext={canStep(1)}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onFlip={flip}
          onRead={() => open(comic)}
          onView={pageImage ? () => setViewing(true) : undefined}
          saveHref={saveHref}
          onShare={share}
          shareGlow={glowId === comic.id}
          more={more}
          grow={isSingleDone && !editing ? () => tray.current?.extend(comic) : undefined}
          onEdit={
            canRedraw && page?.status === "ready"
              ? () => {
                  setEditTarget({ comicId: comic.id, pageId: page.id });
                  setEditing(true);
                }
              : undefined
          }
          edit={
            editing
              ? {
                  extra: admin ? <AdminModels value={editModel} onChange={setEditModel} multiple={false} /> : undefined,
                  text: editText,
                  marks: marks.length,
                  sending,
                  onText: setEditText,
                  onUndo: () => setMarks((list) => list.slice(0, -1)),
                  onSend: () => void sendEdit(),
                  onCancel: stopEditing,
                }
              : null
          }
          removing={removing}
          onConfirmRemove={remove}
          onCancelRemove={() => setRemoving(false)}
          spread={
            spreadPages?.left && spreadPages.right
              ? {
                  left: pageLabel(comic, spreadPages.left),
                  right: pageLabel(comic, spreadPages.right),
                  side: spreadSide,
                  onSide: (side) => {
                    setSpreadSide(side);
                    stage.current?.setFocusSide(side);
                  },
                }
              : undefined
          }
          ticks={sheets.map((_, i) => (reading ? `Sheet ${i + 1}` : (visible[i]?.title ?? `Comic ${i + 1}`)))}
          current={index}
          onTick={goTo}
        />
      )}

      {editing && <MarkLayer getRect={sheetRect} marks={marks} onChange={setMarks} />}
      {mounted && !editing && <HeroLayer getStage={getStage} session={session} hero={hero} suited={suited} />}

      {indexOpen && !reading && (
        <div className="absolute inset-0 z-20 overflow-y-auto overscroll-contain bg-stage px-4 pt-[calc(max(0.75rem,env(safe-area-inset-top))+4.5rem)] pb-16 sm:px-7">
          <ul className="mx-auto grid max-w-6xl grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-x-3 gap-y-5 sm:grid-cols-[repeat(auto-fill,minmax(132px,1fr))] sm:gap-x-4 sm:gap-y-6">
            {visible.map((member) => {
              const cover = member.pages.find((p) => p.kind === "cover") ?? member.pages[0];
              const thumb = cover?.status === "ready" ? pageUrl(cover, 320) : undefined;
              return (
                <li key={member.id}>
                  <button
                    type="button"
                    onClick={() => {
                      stopEditing();
                      setSelectedId(member.id);
                      setShelfFace(0);
                      setIndexOpen(false);
                    }}
                    className="group block w-full text-left"
                  >
                    <span className="block aspect-[2/3] overflow-hidden rounded-[3px] bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.12),0_8px_20px_-12px_rgb(0_0_0/0.35)] ring-1 ring-line transition-transform duration-200 group-hover:-translate-y-1 group-hover:-rotate-1">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element -- stored at thumbnail size already
                        <img src={thumb} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      ) : (
                        <span className={`${quiet} grid h-full place-items-center text-mute`}>
                          {member.status === "generating" ? "Drawing…" : "No cover"}
                        </span>
                      )}
                    </span>
                    <span className="mt-2 block truncate text-[12.5px] font-medium">{member.title}</span>
                    <span className="block font-mono text-[10px] text-mute">{getEra(member.era).name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mx-auto mt-12 max-w-6xl">
            <AccountLine />
          </div>
        </div>
      )}

      {viewing && comic && pageImage && (
        <PageViewer
          src={pageImage}
          alt={`${comic.title}, ${pageLabel(comic, page)}`}
          label={pageLabel(comic, page)}
          detail={viewDetail}
          onClose={() => setViewing(false)}
          onPrev={canStep(-1) ? () => step(-1) : undefined}
          onNext={canStep(1) ? () => step(1) : undefined}
        />
      )}

      {pending && (
        <PasscodePrompt
          error={pending.error}
          onCancel={() => setPending(null)}
          onUnlock={(value) => {
            setPasscode(value);
            const run = pending.run;
            setPending(null);
            guarded(run);
          }}
        />
      )}

      <MakeTray ref={tray} open={composing} info={info} onOpen={() => setComposing(true)} onClose={() => setComposing(false)} onStarted={started} />
    </main>
  );
}

function PasscodePrompt({ error, onCancel, onUnlock }: { error?: string; onCancel(): void; onUnlock(value: string): void }) {
  const [value, setValue] = useState("");
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/20 px-5" onClick={onCancel}>
      <form
        role="dialog"
        aria-label="Studio passcode"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) onUnlock(value.trim());
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
        className="w-full max-w-sm rounded-2xl bg-paper p-5 shadow-xl ring-1 ring-line"
      >
        <p className="font-display text-2xl uppercase tracking-wide">Passcode</p>
        <p className="mt-1 text-[13px] leading-relaxed text-mute">Removing a comic needs the passcode.</p>
        {error && <p className="mt-2 text-[13px] text-accent">{error}</p>}
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          data-keep-paste
          className="mt-3 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-base outline-none focus:border-ink sm:text-[14px]"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={`${quiet} h-11 px-3 text-mute hover:text-ink`}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={!value.trim()}
            className="h-11 rounded-full bg-ink px-5 font-mono text-[11px] uppercase tracking-[0.14em] text-paper disabled:opacity-40"
          >
            Unlock
          </button>
        </div>
      </form>
    </div>
  );
}
