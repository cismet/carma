import type { CSSProperties } from "react";

const topBarHeightPx = 32;
const contentMaxWidthPx = 980;

export const GEO_STORY_STYLES: {
  chrome: {
    topBarHeightPx: number;
    contentMaxWidthPx: number;
  };
  layout: {
    page: CSSProperties;
    topBar: CSSProperties;
    topBarContent: CSSProperties;
    topBarLabel: CSSProperties;
    topBarValue: CSSProperties;
    content: CSSProperties;
    panel: CSSProperties;
    intro: CSSProperties;
  };
  text: {
    introTitle: CSSProperties;
    introText: CSSProperties;
    panelTitle: CSSProperties;
    svg: CSSProperties;
    link: CSSProperties;
  };
} = {
  chrome: {
    topBarHeightPx,
    contentMaxWidthPx,
  },
  layout: {
    page: {
      width: "100%",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      background: "#e2e8f0",
    },
    topBar: {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
    },
    topBarContent: {
      maxWidth: contentMaxWidthPx,
      margin: "0 auto",
      padding: "0 18px",
      width: "100%",
      display: "flex",
      alignItems: "center",
      gap: 8,
      minWidth: 0,
      whiteSpace: "nowrap",
      overflow: "hidden",
    },
    content: {
      display: "flex",
      flexDirection: "column",
      gap: 18,
      padding: `${18 + topBarHeightPx}px 18px 18px`,
      alignItems: "stretch",
      width: "100%",
      maxWidth: contentMaxWidthPx,
      margin: "0 auto",
    },
    panel: {
      display: "flex",
      flexDirection: "column",
      gap: 12,
      padding: 0,
      background: "transparent",
      width: "100%",
    },
    intro: {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(280px, 1fr))",
      gap: 10,
      width: "100%",
    },
  },
  text: {
    topBarLabel: {
      fontWeight: 700,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: "#6b7280",
      whiteSpace: "nowrap",
    },
    topBarValue: {
      fontWeight: 400,
      color: "#374151",
      whiteSpace: "nowrap",
    },
    introTitle: {
      margin: 0,
      color: "#0f172a",
      fontSize: 20,
      fontWeight: 700,
    },
    introText: {
      margin: 0,
      color: "#475569",
      fontSize: 13,
      lineHeight: 1.55,
    },
    panelTitle: {
      margin: 0,
      color: "#0f172a",
      fontSize: 18,
      fontWeight: 700,
    },
    svg: {
      fill: "#334155",
      fontSize: 12,
      fontFamily:
        '"IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    },
    link: {
      color: "#1d4ed8",
      textDecoration: "underline",
      textUnderlineOffset: "2px",
    },
  },
};
