// When the make tray starts a comic on its own. Dropping files (or pasting a
// link) is the whole gesture; typing anything or opening the details means the
// person wants to say more, so they press Make themselves.

export const COUNTDOWN_MS = 3000;

export interface TrayState {
  files: { done: boolean; failed: boolean }[];
  links: number;
  /** A link arrived by pasting outside a text box, the same gesture as a drop. */
  linkPasted: boolean;
  title: string;
  story: string;
  detailsOpen: boolean;
  busy: boolean;
  /** The last start failed: wait for the person (or new material) before trying again. */
  failed?: boolean;
}

export function autoStartArmed(s: TrayState): boolean {
  if (s.busy || s.failed || s.detailsOpen || s.title.trim() || s.story.trim()) return false;
  if (s.files.some((f) => !f.done && !f.failed)) return false;
  const sent = s.files.filter((f) => f.done).length;
  return sent > 0 || (s.links > 0 && s.linkPasted);
}
