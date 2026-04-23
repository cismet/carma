import type { Radians } from "@carma-units";

import { typographyDefaults } from "./annotation-typography-defaults";

export const PREVIEW_LINE_LABEL_BACKGROUND_STYLE = {
  SOFT_RECT_FADE: "soft-rect-fade",
} as const;

export const PREVIEW_LINE_LABEL_THEME = {
  DARK_ON_BRIGHT: "dark-on-bright",
  BRIGHT_ON_DARK: "bright-on-dark",
} as const;

export const PREVIEW_LINE_LABEL_COLLISION_RESOLUTION_STRATEGY = {
  NONE: "none",
  MOVE_ON_LINE: "move-on-line",
} as const;

export type PreviewLineLabelBackgroundStyle =
  (typeof PREVIEW_LINE_LABEL_BACKGROUND_STYLE)[keyof typeof PREVIEW_LINE_LABEL_BACKGROUND_STYLE];
export type PreviewLineLabelTheme =
  (typeof PREVIEW_LINE_LABEL_THEME)[keyof typeof PREVIEW_LINE_LABEL_THEME];
export type PreviewLineLabelCollisionResolutionStrategy =
  (typeof PREVIEW_LINE_LABEL_COLLISION_RESOLUTION_STRATEGY)[keyof typeof PREVIEW_LINE_LABEL_COLLISION_RESOLUTION_STRATEGY];

export type PreviewLineLabelVisualOptions = Readonly<{
  fontFamily: string;
  fontWeight: string | number;
  backgroundStyle: PreviewLineLabelBackgroundStyle;
  theme: PreviewLineLabelTheme;
  shortEdgeOffsetPx: number;
  allowEarlyRemoval: boolean;
  collisionResolutionStrategy: PreviewLineLabelCollisionResolutionStrategy;
  anchorSlideStepRatio: number;
  maxAnchorSlideDeltaRatio: number;
}>;

export type PreviewLineLabelPlacementDefaults = Readonly<{
  verticalFlippedBaselineOffsetPx: number;
  verticalBaselineAngleEpsilonRad: Radians;
  sideHysteresisPx: number;
  upperSideGapFactor: number;
  upperSideGapNormalYEpsilon: number;
}>;

export const previewLineLabelVisualDefaults: PreviewLineLabelVisualOptions =
  Object.freeze({
    fontFamily: typographyDefaults.fontFamily,
    fontWeight: typographyDefaults.lineLabelFontWeight,
    backgroundStyle: PREVIEW_LINE_LABEL_BACKGROUND_STYLE.SOFT_RECT_FADE,
    theme: PREVIEW_LINE_LABEL_THEME.BRIGHT_ON_DARK,
    shortEdgeOffsetPx: -2,
    allowEarlyRemoval: true,
    collisionResolutionStrategy:
      PREVIEW_LINE_LABEL_COLLISION_RESOLUTION_STRATEGY.MOVE_ON_LINE,
    anchorSlideStepRatio: 0.1,
    maxAnchorSlideDeltaRatio: 0.3,
  });

export const previewLineLabelPlacementDefaults: PreviewLineLabelPlacementDefaults =
  Object.freeze({
    verticalFlippedBaselineOffsetPx: 6,
    verticalBaselineAngleEpsilonRad: 1e-9 as Radians,
    sideHysteresisPx: 1.5,
    upperSideGapFactor: 0.15,
    upperSideGapNormalYEpsilon: 1e-3,
  });

export const resolvePreviewLineLabelVisualOptions = (
  visualOptions?: Partial<PreviewLineLabelVisualOptions>
): PreviewLineLabelVisualOptions => ({
  ...previewLineLabelVisualDefaults,
  ...visualOptions,
});
