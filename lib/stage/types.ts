export interface StageFace {
  /** Image URL when the face has art. */
  src?: string;
  /**
   * ready: show `src`. pending: being drawn. failed: drawing failed.
   * blank: no art exists for this side, typeset one from `title`/`subtitle`.
   */
  state: "ready" | "pending" | "failed" | "blank";
  title?: string;
  subtitle?: string;
  note?: string;
}

export interface StageSheet {
  key: string;
  front: StageFace;
  back: StageFace;
  /** On the shelf: how thick the closed comic is, 0 (a single) to 1 (a fat book). */
  thickness?: number;
  /** Still sealed in its bag on this device. */
  sealed?: boolean;
}

export interface StageCallbacks {
  /** The carousel settled on another sheet, which is showing `face`. */
  onIndex(index: number, face: 0 | 1): void;
  /** The current sheet came to rest showing its front (0) or back (1). */
  onFace(index: number, face: 0 | 1): void;
  /** A sealed comic's bag was opened and the comic slid out. */
  onSealBroken?(key: string): void;
}
