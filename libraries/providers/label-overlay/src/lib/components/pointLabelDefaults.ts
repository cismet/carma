import { MINUS_PI_OVER_FOUR } from "@carma-commons/math";
import { resolveDisplayP3WhiteCssColor } from "@carma-commons/utils";

import { DEFAULT_PILL_LABEL_HEIGHT_EM } from "../core/pillConnectorGeometry";

export const POINT_LABEL_THEME_DEFAULTS = {
  textBackgroundColor: "rgba(30, 41, 59, 0.62)",
  hoverBackgroundColor: "rgba(51, 65, 85, 0.68)",
  selectedBackgroundColor: "rgba(71, 85, 105, 0.74)",
} as const;

export const POINT_LABEL_COMPONENT_DEFAULTS = {
  pitch: MINUS_PI_OVER_FOUR,
  transitionDurationMs: 300,
  textColor: "rgba(248, 250, 252, 0.98)",
  selectedTextColor: "rgba(248, 250, 252, 0.98)",
  selectedGlowRadiusPx: 0,
  preserveFillOnSelection: false,
  lineColor: resolveDisplayP3WhiteCssColor(0.88),
  lineWidth: 1,
  markerSize: 10,
  markerStrokeWidth: 1,
  markerBackgroundColor: "rgba(75, 85, 99, 1)",
  markerTextColor: "rgba(239, 246, 255, 0.98)",
  longPressDurationMs: 300,
} as const;

export const POINT_LABEL_LAYOUT_DEFAULTS = {
  pillStemEndInsetPx: 1.5,
  pillLabelCapRadiusEm: DEFAULT_PILL_LABEL_HEIGHT_EM / 2,
} as const;

export const POINT_LABEL_INTERACTION_DEFAULTS = {
  // Hidden DOM hit-target diameter only. Cursor-to-node snap hysteresis lives
  // in runtime nodeSnap.helpers.ts and is intentionally a separate concern.
  hiddenInteractionMarkerDiameterPx: 18,
  dragStartThresholdPx: 3,
} as const;
