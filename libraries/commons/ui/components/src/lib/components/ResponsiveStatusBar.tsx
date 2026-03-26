import type { CSSProperties, ReactNode } from "react";
import {
  FROSTED_GLASS_BLUR_PRESET,
  readFrostedGlassBackdropStyle,
} from "../utils/frostedGlass";

type ResponsiveStatusBarProps = {
  text?: ReactNode | null;
  label?: ReactNode;
  values?: readonly ReactNode[];
  className?: string;
  barHeight?: string;
  tone?: "light" | "dark";
};

const DEFAULT_STATUS_BAR_HEIGHT = "24px";
const STATUS_BAR_FONT_FAMILY =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const ResponsiveStatusBar = ({
  text,
  label,
  values = [],
  className,
  barHeight = DEFAULT_STATUS_BAR_HEIGHT,
  tone = "light",
}: ResponsiveStatusBarProps) => {
  const isDarkTone = tone === "dark";
  const hasText =
    text !== null &&
    text !== undefined &&
    !(typeof text === "string" && text.trim().length === 0);
  const hasLabeledValues = label !== undefined || values.length > 0;
  const isVisible = hasText || hasLabeledValues;

  const renderedContent = hasText ? (
    text
  ) : (
    <>
      {label !== undefined ? (
        <span
          style={{
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: isDarkTone ? "rgba(226, 232, 240, 0.9)" : "#6b7280",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      ) : null}
      {values.map((value, index) => (
        <span
          key={`status-value-${index}`}
          style={{
            fontWeight: 400,
            color: isDarkTone ? "rgba(248, 250, 252, 0.96)" : "#374151",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </span>
      ))}
    </>
  );

  const rootStyle: CSSProperties = {
    height: barHeight,
    width: "100%",
    boxSizing: "border-box",
    overflow: "hidden",
    pointerEvents: "none",
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? "translateY(0)" : "translateY(-8px)",
    transition: "opacity 220ms ease, transform 220ms ease",
  };

  const backgroundStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    overflow: "hidden",
    pointerEvents: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: isDarkTone
      ? "rgba(2, 6, 23, 0.72)"
      : "rgba(255, 255, 255, 0.36)",
    ...readFrostedGlassBackdropStyle(FROSTED_GLASS_BLUR_PRESET.CLOSE),
    borderBottom: isDarkTone
      ? "1px solid rgba(148, 163, 184, 0.42)"
      : "1px solid rgba(148, 163, 184, 0.35)",
    boxShadow: "none",
  };

  const contentStyle: CSSProperties = {
    margin: "0 auto",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    pointerEvents: "none",
    padding: "0 12px",
    textAlign: "center",
    color: isDarkTone ? "rgba(248, 250, 252, 0.96)" : "#4b5563",
    fontWeight: 400,
    fontSize: 11,
    marginBottom: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
    lineHeight: 1.2,
    fontFamily: STATUS_BAR_FONT_FAMILY,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    overflowX: "auto",
    overflowY: "hidden",
    scrollbarWidth: "none",
  };

  return (
    <div
      className={className}
      style={rootStyle}
      role="status"
      aria-live="polite"
      aria-hidden={!isVisible}
    >
      <div style={backgroundStyle}>
        <div style={contentStyle}>{renderedContent}</div>
      </div>
    </div>
  );
};

export type { ResponsiveStatusBarProps };
export { ResponsiveStatusBar };
