import type { CSSProperties, ReactNode } from "react";

import barmenBackgroundUrl from "../../providers/label-overlay/assets/barmen-background.png";

export const STORY_MASONRY_BACKGROUND_MODES = {
  PLAIN: "plain",
  SLATE: "slate",
  CHECKERBOARD: "checkerboard",
  URBAN: "urban",
} as const;

export type StoryMasonryBackgroundMode =
  (typeof STORY_MASONRY_BACKGROUND_MODES)[keyof typeof STORY_MASONRY_BACKGROUND_MODES];

const STORY_MASONRY_TEXT_GLOW_STYLE: CSSProperties = {
  textShadow: [
    "0 0 8px rgba(248, 250, 252, 0.95)",
    "0 0 18px rgba(248, 250, 252, 0.88)",
    "0 0 32px rgba(248, 250, 252, 0.62)",
  ].join(", "),
};

export const STORY_MASONRY_PAGE_STYLE: CSSProperties = {
  userSelect: "text",
};

export const STORY_MASONRY_SECTION_TITLE_STYLE: CSSProperties = {
  ...STORY_MASONRY_TEXT_GLOW_STYLE,
  margin: 0,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.08em",
  lineHeight: 1.2,
  textTransform: "uppercase",
  color: "#334155",
};

export const STORY_MASONRY_SECTION_META_STYLE: CSSProperties = {
  ...STORY_MASONRY_TEXT_GLOW_STYLE,
  fontSize: 12,
  lineHeight: 1.35,
  color: "#475569",
};

export const readStoryMasonryBackground = (
  mode: StoryMasonryBackgroundMode | undefined
): string => {
  if (mode === STORY_MASONRY_BACKGROUND_MODES.SLATE) {
    return "#e5e7eb";
  }

  if (mode === STORY_MASONRY_BACKGROUND_MODES.CHECKERBOARD) {
    return [
      "linear-gradient(45deg, rgba(148,163,184,0.14) 25%, transparent 25%)",
      "linear-gradient(-45deg, rgba(148,163,184,0.14) 25%, transparent 25%)",
      "linear-gradient(45deg, transparent 75%, rgba(148,163,184,0.14) 75%)",
      "linear-gradient(-45deg, transparent 75%, rgba(148,163,184,0.14) 75%)",
      "#f8fafc",
    ].join(", ");
  }

  if (mode === STORY_MASONRY_BACKGROUND_MODES.URBAN) {
    return `linear-gradient(180deg, rgba(248, 250, 252, 0.08), rgba(241, 245, 249, 0.16)), url(${barmenBackgroundUrl})`;
  }

  return "#f8fafc";
};

export const readStoryMasonryBackgroundStyle = (
  mode: StoryMasonryBackgroundMode | undefined
): CSSProperties | undefined =>
  mode === STORY_MASONRY_BACKGROUND_MODES.CHECKERBOARD
    ? {
        backgroundSize: "24px 24px",
        backgroundPosition: "0 0, 0 12px, 12px -12px, -12px 0px",
      }
    : mode === STORY_MASONRY_BACKGROUND_MODES.URBAN
    ? {
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }
    : undefined;

export const buildStoryMasonryGridStyle = ({
  columnWidthPx = 352,
  gapPx = 24,
  maxWidthPx = 1120,
}: {
  columnWidthPx?: number;
  gapPx?: number;
  maxWidthPx?: number;
} = {}): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${columnWidthPx}px), ${columnWidthPx}px))`,
  gap: gapPx,
  alignItems: "start",
  justifyContent: "center",
  width: "100%",
  maxWidth: maxWidthPx,
  margin: "0 auto",
});

export const buildStoryMasonryPanelStyle = ({
  padding = 14,
  gap = 12,
}: {
  padding?: number;
  gap?: number;
} = {}): CSSProperties => ({
  display: "grid",
  gap,
  minWidth: 0,
  width: "100%",
  padding,
  borderRadius: 14,
  border: "1px solid rgba(255, 255, 255, 0.28)",
  background: "rgba(248, 250, 252, 0.56)",
  backdropFilter: "blur(14px) saturate(0.92) brightness(1.03)",
  WebkitBackdropFilter: "blur(14px) saturate(0.92) brightness(1.03)",
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
});

export const StoryMasonrySection = ({
  title,
  meta,
  children,
  style,
}: {
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) => (
  <section style={{ ...buildStoryMasonryPanelStyle(), ...style }}>
    <header style={{ display: "grid", gap: 8 }}>
      <h2 style={STORY_MASONRY_SECTION_TITLE_STYLE}>{title}</h2>
      {meta ? <p style={STORY_MASONRY_SECTION_META_STYLE}>{meta}</p> : null}
    </header>
    <div>{children}</div>
  </section>
);
