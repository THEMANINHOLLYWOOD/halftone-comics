"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Stage } from "@/lib/stage/engine";
import type { StageSheet } from "@/lib/stage/types";

let webgl: boolean | null = null;
/** Whether this browser can draw the stage at all; checked once. */
function canDraw(): boolean {
  if (webgl === null) {
    try {
      webgl = !!document.createElement("canvas").getContext("webgl2");
    } catch {
      webgl = false;
    }
  }
  return webgl;
}
const never = () => () => {};

interface Props {
  sheets: StageSheet[];
  /** Sheets left of the current one rest face-down (reading a comic). */
  turned: boolean;
  index: number;
  face: 0 | 1;
  label: string;
  /** Marking up the current sheet: it lies flat and stops taking drags. */
  editing?: boolean;
  onReady?: (stage: Stage | null) => void;
  /** Space taken by the header and footer, so the sheet sits between them. */
  insets: { top: number; bottom: number };
  onIndex(index: number, face: 0 | 1): void;
  onFace(index: number, face: 0 | 1): void;
  onSealBroken?(key: string): void;
}

export function StageCanvas({ sheets, turned, index, face, label, editing = false, onReady, insets, onIndex, onFace, onSealBroken }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<Stage | null>(null);
  const handlers = useRef({ onIndex, onFace, onSealBroken });
  const readyRef = useRef(onReady);
  const position = useRef({ index, face });
  const supported = useSyncExternalStore(never, canDraw, () => true);

  useEffect(() => {
    handlers.current = { onIndex, onFace, onSealBroken };
    readyRef.current = onReady;
    position.current = { index, face };
  });

  useEffect(() => {
    if (!supported || !canvas.current) return;
    const root = getComputedStyle(document.documentElement);
    const fonts = {
      display: root.getPropertyValue("--font-anton").trim() || "Impact, sans-serif",
      mono: root.getPropertyValue("--font-geist-mono").trim() || "ui-monospace, monospace",
    };
    let made: Stage;
    try {
      made = new Stage(
        canvas.current,
        {
          onIndex: (i, f) => handlers.current.onIndex(i, f),
          onFace: (i, f) => handlers.current.onFace(i, f),
          onSealBroken: (key) => handlers.current.onSealBroken?.(key),
        },
        fonts,
      );
    } catch {
      return;
    }
    stage.current = made;
    readyRef.current?.(made);
    // Typeset faces are drawn with web fonts; redraw them once those arrive.
    void document.fonts.ready.then(() => made.refreshPaper());
    return () => {
      readyRef.current?.(null);
      made.dispose();
      stage.current = null;
    };
  }, [supported]);

  useEffect(() => {
    stage.current?.setSheets(sheets, { turned, ...position.current });
  }, [sheets, turned]);

  useEffect(() => {
    stage.current?.goTo(index, face);
  }, [index, face]);

  useEffect(() => {
    stage.current?.setEditing(editing);
  }, [editing, supported]);

  useEffect(() => {
    stage.current?.setInsets(insets.top, insets.bottom);
  }, [insets.top, insets.bottom, supported]);

  if (!supported) {
    return (
      <div className="absolute inset-0 grid place-items-center px-8 text-center text-sm text-mute">
        This browser has WebGL turned off, so the sheets cannot be shown. Turn on hardware
        acceleration and reload.
      </div>
    );
  }

  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={label}
      className="absolute inset-0 h-full w-full touch-none select-none outline-none"
    />
  );
}
