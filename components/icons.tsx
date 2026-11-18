// Line icons for every control: one weight, drawn on a 20-unit grid, in the
// current text colour.

import type { ReactNode } from "react";

interface IconProps {
  size?: number;
}

function Icon({ size = 20, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const IconPrev = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12.5 4.5 7 10l5.5 5.5" />
  </Icon>
);

export const IconNext = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.5 4.5 13 10l-5.5 5.5" />
  </Icon>
);

/** An open book. */
export const IconRead = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 5.5C8.4 4.4 6 4 3 4.2v10.6c3-.2 5.4.2 7 1.3 1.6-1.1 4-1.5 7-1.3V4.2C14 4 11.6 4.4 10 5.5Z" />
    <path d="M10 5.5v10.6" />
  </Icon>
);

/** A sheet turning over. */
export const IconFlip = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7.5a6.5 6.5 0 0 1 11.3-2.3M16 12.5a6.5 6.5 0 0 1-11.3 2.3" />
    <path d="M15.6 2.4v3.1h-3.1M4.4 17.6v-3.1h3.1" />
  </Icon>
);

export const IconView = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.5 3.5h-4v4M12.5 3.5h4v4M7.5 16.5h-4v-4M12.5 16.5h4v-4" />
  </Icon>
);

export const IconSave = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3.5v9M6 9l4 4 4-4M4 16.5h12" />
  </Icon>
);

export const IconShare = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 12.5v-9M6.5 7 10 3.5 13.5 7" />
    <path d="M6.5 10H5v6.5h10V10h-1.5" />
  </Icon>
);

export const IconMore = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="4.5" cy="10" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="10" cy="10" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="10" r="0.9" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconGrid = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="5" height="5" rx="0.6" />
    <rect x="11.5" y="3.5" width="5" height="5" rx="0.6" />
    <rect x="3.5" y="11.5" width="5" height="5" rx="0.6" />
    <rect x="11.5" y="11.5" width="5" height="5" rx="0.6" />
  </Icon>
);

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 4v12M4 10h12" />
  </Icon>
);

export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 5l10 10M15 5 5 15" />
  </Icon>
);

export const IconBack = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16 10H4M8.5 5.5 4 10l4.5 4.5" />
  </Icon>
);

/** A pencil with a spark: change something on this page. */
export const IconEdit = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 16l1-4 7.5-7.5a2.1 2.1 0 0 1 3 3L8 15l-4 1Z" />
    <path d="M11 6l3 3" />
    <path d="M16 13.5v3M14.5 15h3" />
  </Icon>
);

export const IconSend = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 16V4.5M5.5 9 10 4.5 14.5 9" />
  </Icon>
);

export const IconUndo = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.5 5 4 8.5 7.5 12" />
    <path d="M4.5 8.5H12a4 4 0 0 1 0 8H9" />
  </Icon>
);
