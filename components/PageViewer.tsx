"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  src: string;
  alt: string;
  label: string;
  /** Who drew it and the page's caption, under the label. */
  detail?: string;
  onClose(): void;
  onPrev?: () => void;
  onNext?: () => void;
}

/**
 * A page at full size, for reading the lettering on a phone. Double-tap (or
 * click) zooms in where you tapped; drag or scroll to move around; pinch
 * works too.
 */
export function PageViewer({ src, alt, label, detail, onClose, onPrev, onNext }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [zoomed, setZoomed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [shown, setShown] = useState(src);
  if (shown !== src) {
    // A new page: start it un-zoomed.
    setShown(src);
    setZoomed(false);
    setLoaded(false);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") onNext?.();
      else if (event.key === "ArrowLeft") onPrev?.();
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, onNext, onPrev]);

  const toggle = (event: React.MouseEvent<HTMLImageElement>) => {
    const el = box.current;
    const img = event.currentTarget;
    if (!el) return;
    if (zoomed) {
      setZoomed(false);
      return;
    }
    // Keep the tapped spot under the finger once the page is 2.5x wider.
    const rect = img.getBoundingClientRect();
    const fx = (event.clientX - rect.left) / rect.width;
    const fy = (event.clientY - rect.top) / rect.height;
    setZoomed(true);
    requestAnimationFrame(() => {
      el.scrollLeft = fx * el.scrollWidth - el.clientWidth / 2;
      el.scrollTop = fy * el.scrollHeight - el.clientHeight / 2;
    });
  };

  const control =
    "grid h-11 w-11 place-items-center rounded-full bg-paper/90 text-ink shadow-sm ring-1 ring-line backdrop-blur disabled:opacity-30";

  return (
    <div role="dialog" aria-label={`${label}, full size`} className="fixed inset-0 z-50 bg-stage">
      <div
        ref={box}
        className="absolute inset-0 overflow-auto overscroll-contain"
        style={{ touchAction: "pan-x pan-y pinch-zoom" }}
      >
        <div
          className={`flex min-h-full items-center justify-center ${zoomed ? "w-[250%] p-0" : "w-full px-3 pt-[max(4rem,env(safe-area-inset-top))] pb-[max(5.5rem,env(safe-area-inset-bottom))]"}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- stored sheets are served at fixed sizes already */}
          <img
            src={src}
            alt={alt}
            onLoad={() => setLoaded(true)}
            onClick={toggle}
            draggable={false}
            className={`select-none shadow-[0_1px_3px_rgba(0,0,0,0.12)] transition-opacity ${loaded ? "opacity-100" : "opacity-0"} ${zoomed ? "w-full cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in object-contain"}`}
            style={zoomed ? undefined : { maxHeight: "calc(100dvh - 9.5rem)" }}
          />
        </div>
      </div>
      {!loaded && (
        <p className="pointer-events-none absolute inset-0 grid place-items-center font-mono text-[10.5px] uppercase tracking-[0.16em] text-mute">
          Loading the page…
        </p>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto min-w-0 rounded-2xl bg-paper/90 px-3 py-1.5 ring-1 ring-line backdrop-blur">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em]">{label}</p>
          {detail && <p className="max-w-[70vw] truncate text-[11.5px] text-mute sm:max-w-md">{detail}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className={`pointer-events-auto ${control}`}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M1 1l12 12M13 1L1 13" />
          </svg>
        </button>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={onPrev} disabled={!onPrev} aria-label="Previous page" className={`pointer-events-auto ${control}`}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M10 3L5 8l5 5" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setZoomed((value) => !value)}
          className="pointer-events-auto h-11 rounded-full bg-ink px-5 font-mono text-[11px] uppercase tracking-[0.14em] text-paper"
        >
          {zoomed ? "Fit" : "Zoom"}
        </button>
        <button type="button" onClick={onNext} disabled={!onNext} aria-label="Next page" className={`pointer-events-auto ${control}`}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M6 3l5 5-5 5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
