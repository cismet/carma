import type { CSSProperties, ReactNode } from "react";
import {
  LINEAR_SEGMENT_LINE_MODE_COMPONENTS,
  LINEAR_SEGMENT_LINE_MODE_DIRECT,
  type LinearSegmentLineMode,
} from "@carma-mapping/annotations/core";
import { INACTIVE_ICON_COLOR, toolButtonStyle } from "../../shared";

export type SegmentLineModeOption = {
  mode: LinearSegmentLineMode;
  label: string;
  tooltip: string;
  icon: ReactNode;
  dataTestId: string;
};

const CUSTOM_ICON_STROKE = "currentColor";
const CUSTOM_ICON_LINE_WIDTH = 1.35;
const CUSTOM_ICON_ARROW_WIDTH = 1.15;

export const DIRECT_SEGMENT_LINE_MODE_ICON = (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path
      d="M2 7H12"
      stroke={CUSTOM_ICON_STROKE}
      strokeWidth={CUSTOM_ICON_LINE_WIDTH}
      strokeLinecap="round"
    />
    <path
      d="M2 7L3.2 5.8M2 7L3.2 8.2"
      stroke={CUSTOM_ICON_STROKE}
      strokeWidth={CUSTOM_ICON_ARROW_WIDTH}
      strokeLinecap="round"
    />
    <path
      d="M12 7L10.8 5.8M12 7L10.8 8.2"
      stroke={CUSTOM_ICON_STROKE}
      strokeWidth={CUSTOM_ICON_ARROW_WIDTH}
      strokeLinecap="round"
    />
  </svg>
);

export const COMPONENTS_SEGMENT_LINE_MODE_ICON = (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path
      d="M11.5 12V2.3"
      stroke={CUSTOM_ICON_STROKE}
      strokeWidth={CUSTOM_ICON_LINE_WIDTH}
      strokeLinecap="round"
    />
    <path
      d="M11.5 12H1.8"
      stroke={CUSTOM_ICON_STROKE}
      strokeWidth={CUSTOM_ICON_LINE_WIDTH}
      strokeLinecap="round"
    />
    <path
      d="M11.5 2.3L10.3 3.5M11.5 2.3L12.7 3.5"
      stroke={CUSTOM_ICON_STROKE}
      strokeWidth={CUSTOM_ICON_ARROW_WIDTH}
      strokeLinecap="round"
    />
    <path
      d="M1.8 12L3 10.8M1.8 12L3 13.2"
      stroke={CUSTOM_ICON_STROKE}
      strokeWidth={CUSTOM_ICON_ARROW_WIDTH}
      strokeLinecap="round"
    />
  </svg>
);

export const SEGMENT_LINE_MODE_OPTIONS: readonly SegmentLineModeOption[] = [
  {
    mode: LINEAR_SEGMENT_LINE_MODE_DIRECT,
    label: "Direkt",
    tooltip: "Nur Direktlinie anzeigen",
    icon: DIRECT_SEGMENT_LINE_MODE_ICON,
    dataTestId: "segment-line-mode-direct",
  },
  {
    mode: LINEAR_SEGMENT_LINE_MODE_COMPONENTS,
    label: "Komponenten",
    tooltip: "Nur Komponenten anzeigen",
    icon: COMPONENTS_SEGMENT_LINE_MODE_ICON,
    dataTestId: "segment-line-mode-components",
  },
];

export const segmentLineModeOptionButtonStyle = (
  active: boolean
): CSSProperties => ({
  ...toolButtonStyle(active),
  width: 24,
  height: 24,
  padding: 0,
  borderRadius: 6,
  border: `1px solid ${
    active ? "rgba(75, 85, 99, 0.72)" : "rgba(107, 114, 128, 0.4)"
  }`,
  backgroundColor: active ? "rgba(75, 85, 99, 0.12)" : "transparent",
  boxShadow: "none",
  color: INACTIVE_ICON_COLOR,
});
