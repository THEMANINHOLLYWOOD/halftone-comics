"use client";

import { useEffect, useRef, useState } from "react";
import type { Mark } from "@/lib/marks";

type Rect = { left: number; top: number; width: number; height: number };

interface Props {
  /** Where the page sits on screen right now (it eases flat when editing starts). */
  getRect(): Rect | null;
  marks: Mark[];
  onChange(marks: Mark[]): void;
}

const MAX_MARKS = 12;

/**
 * Drawing on the page to point at things: drag a loop around something, or tap
 * a spot. Marks are kept in page fractions so they match the art at any size.
 */
export function MarkLayer({ getRect, marks, onChange }: Props) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [live, setLive] = useState<Mark | null>(null);
  const drawing = useRef<Mark | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // Follow the page while it settles flat (and on resize).
  useEffect(() => {
    let frame = 0;
    let last = "";
    const tick = () => {
      const next = getRect();
      const key = next ? `${next.left.toFixed(1)},${next.top.toFixed(1)},${next.width.toFixed(1)},${next.height.toFixed(1)}` : "";
      if (key !== last) {
        last = key;
        setRect(next);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // Frames can be paused (a background tab, some embedded views); a slow timer keeps the rect right.
    const timer = setInterval(() => {
      const next = getRect();
      const key = next ? `${next.left.toFixed(1)},${next.top.toFixed(1)},${next.width.toFixed(1)},${next.height.toFixed(1)}` : "";
      if (key !== last) {
        last = key;
        setRect(next);
      }
    }, 120);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, [getRect]);

  const at = (event: React.PointerEvent): [number, number] | null => {
    const el = box.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [Math.min(Math.max((event.clientX - r.left) / r.width, 0), 1), Math.min(Math.max((event.clientY - r.top) / r.height, 0), 1)];
  };

  if (!rect) return null;

  const path = (mark: Mark) => mark.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");

  return (
    <div
      ref={box}
      className="fixed z-[15] touch-none select-none"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, cursor: "crosshair" }}
      onPointerDown={(event) => {
        if (marks.length >= MAX_MARKS) return;
        const p = at(event);
        if (!p) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drawing.current = [p];
        setLive([p]);
      }}
      onPointerMove={(event) => {
        const mark = drawing.current;
        const p = at(event);
        if (!mark || !p) return;
        const [lx, ly] = mark[mark.length - 1];
        if (Math.hypot(p[0] - lx, p[1] - ly) < 0.006) return;
        mark.push(p);
        setLive([...mark]);
      }}
      onPointerUp={() => {
        const mark = drawing.current;
        drawing.current = null;
        setLive(null);
        if (!mark) return;
        // A short scribble is a tap: a ring around that spot.
        const span = Math.max(...mark.map((p) => Math.hypot(p[0] - mark[0][0], p[1] - mark[0][1])));
        onChange([...marks, span < 0.03 ? [mark[0]] : mark]);
      }}
      onPointerCancel={() => {
        drawing.current = null;
        setLive(null);
      }}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[2px] ring-2 ring-accent/40 ring-offset-0" />
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        {[...marks, ...(live ? [live] : [])].map((mark, i) =>
          mark.length < 3 ? (
            <ellipse
              key={i}
              cx={mark[0][0]}
              cy={mark[0][1]}
              rx={0.035}
              ry={0.035 * (rect.width / rect.height)}
              fill="rgb(214 50 26 / 0.12)"
              stroke="#d6321a"
              strokeWidth={2.5}
              vectorEffect="non-scaling-stroke"
              className="mark-pop"
            />
          ) : (
            <path
              key={i}
              d={`${path(mark)}${mark === live ? "" : " Z"}`}
              fill={mark === live ? "none" : "rgb(214 50 26 / 0.10)"}
              stroke="#d6321a"
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ),
        )}
      </svg>
      {!marks.length && !live && (
        <p className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-max rounded-full bg-ink/80 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-paper">
          Circle or tap what to change
        </p>
      )}
    </div>
  );
}
