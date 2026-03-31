import type { CSSProperties, ReactNode } from "react";

import { ResponsiveStatusBar } from "@carma-commons/ui/components";
const STORY_FONT_FAMILY =
  'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

type CenteredStoryFrameProps = {
  label: string;
  values?: readonly ReactNode[];
  children: ReactNode;
  maxWidthPx?: number;
  contentStyle?: CSSProperties;
  background?: string;
  backgroundStyle?: CSSProperties;
};

const buildRootStyle = (
  background: string,
  backgroundStyle?: CSSProperties
): CSSProperties => ({
  width: "100%",
  minHeight: "100vh",
  background,
  ...backgroundStyle,
});

const topBarStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 20,
};

const buildTopBarContentStyle = (maxWidthPx: number): CSSProperties => ({
  maxWidth: maxWidthPx,
  margin: "0 auto",
  padding: 0,
  width: "100%",
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 8,
  minWidth: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  color: "#374151",
  fontSize: 16,
  lineHeight: 1.2,
  fontFamily: STORY_FONT_FAMILY,
});

const topBarLabelStyle: CSSProperties = {
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#6b7280",
  whiteSpace: "nowrap",
};

const topBarValueStyle: CSSProperties = {
  fontWeight: 400,
  color: "#374151",
  whiteSpace: "nowrap",
};

const buildContentStyle = (maxWidthPx: number): CSSProperties => ({
  maxWidth: maxWidthPx,
  margin: "0 auto",
  padding: "18px 24px 28px",
  color: "#0f172a",
  fontSize: 14,
  lineHeight: 1.45,
  fontFamily: STORY_FONT_FAMILY,
});

export const CenteredStoryFrame = ({
  label,
  values = [],
  children,
  maxWidthPx = 1520,
  contentStyle,
  background = "#f8fafc",
  backgroundStyle,
}: CenteredStoryFrameProps) => (
  <div style={buildRootStyle(background, backgroundStyle)}>
    <div style={topBarStyle}>
      <ResponsiveStatusBar
        fontSize={16}
        text={
          <div style={buildTopBarContentStyle(maxWidthPx)}>
            <span style={topBarLabelStyle}>{label}</span>
            {values.map((value, index) => (
              <span
                key={`centered-story-status-${index}`}
                style={topBarValueStyle}
              >
                {value}
              </span>
            ))}
          </div>
        }
      />
    </div>
    <div style={{ ...buildContentStyle(maxWidthPx), ...contentStyle }}>
      {children}
    </div>
  </div>
);
