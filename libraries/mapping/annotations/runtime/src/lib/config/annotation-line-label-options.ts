import type { CssMixBlendMode } from "@carma-commons/dom/document";
import type { Radians } from "@carma-units";

import {
  ANNOTATION_THEME_STYLE,
  type AnnotationThemeStyle,
} from "./annotation-theme-style";
import { typographyDefaults } from "./annotation-typography-defaults";

export const ANNOTATION_LINE_LABEL_BACKGROUND_STYLE = {
  SOFT_RECT_FADE: "soft-rect-fade",
  TEXT_ECHO_DARKEN: "text-echo-darken",
} as const;

export const ANNOTATION_LINE_LABEL_COLLISION_RESOLUTION_STRATEGY = {
  NONE: "none",
  MOVE_ON_LINE: "move-on-line",
} as const;

export type AnnotationLineLabelBackgroundStyle =
  (typeof ANNOTATION_LINE_LABEL_BACKGROUND_STYLE)[keyof typeof ANNOTATION_LINE_LABEL_BACKGROUND_STYLE];
export type AnnotationLineLabelCollisionResolutionStrategy =
  (typeof ANNOTATION_LINE_LABEL_COLLISION_RESOLUTION_STRATEGY)[keyof typeof ANNOTATION_LINE_LABEL_COLLISION_RESOLUTION_STRATEGY];

export type AnnotationLineLabelAppearanceOptions = Readonly<{
  themeStyle: AnnotationThemeStyle;
}>;

export type AnnotationLineLabelTextEchoOptions = Readonly<{
  color?: string;
  blurPx?: number;
  opacity?: number;
  blendMode?: CssMixBlendMode;
}>;

export type AnnotationLineLabelTextOptions = Readonly<{
  fontFamily: string;
  fontWeight: string | number;
  color?: string;
  blendMode?: CssMixBlendMode;
  echo?: AnnotationLineLabelTextEchoOptions;
}>;

export type AnnotationLineLabelBackgroundOptions = Readonly<{
  style: AnnotationLineLabelBackgroundStyle;
  showBackdrop?: boolean;
  color?: string;
  blendMode?: CssMixBlendMode;
  blurPx?: number;
  brightnessPct?: number;
  saturatePct?: number;
  surfaceAlpha?: number;
  radiusEx?: number;
  edgeBlurPx?: number;
  insetBlockEx?: number;
  insetInlineEx?: number;
}>;

export type AnnotationLineLabelSurfaceOptions = Readonly<{
  blendMode?: CssMixBlendMode;
  paddingBlockEx?: number;
  paddingInlineEx?: number;
}>;

export type AnnotationLineLabelLayoutOptions = Readonly<{
  shortEdgeOffsetPx: number;
}>;

export type AnnotationLineLabelCollisionOptions = Readonly<{
  allowEarlyRemoval: boolean;
  resolutionStrategy: AnnotationLineLabelCollisionResolutionStrategy;
  anchorSlideStepRatio: number;
  maxAnchorSlideDeltaRatio: number;
}>;

export type AnnotationLineLabelOptions = Readonly<{
  appearance: AnnotationLineLabelAppearanceOptions;
  text: AnnotationLineLabelTextOptions;
  background: AnnotationLineLabelBackgroundOptions;
  surface: AnnotationLineLabelSurfaceOptions;
  layout: AnnotationLineLabelLayoutOptions;
  collision: AnnotationLineLabelCollisionOptions;
}>;

export type PartialAnnotationLineLabelOptions = Readonly<{
  appearance?: Partial<AnnotationLineLabelAppearanceOptions>;
  text?: Partial<
    Omit<AnnotationLineLabelTextOptions, "echo"> & {
      echo?: Partial<AnnotationLineLabelTextEchoOptions>;
    }
  >;
  background?: Partial<AnnotationLineLabelBackgroundOptions>;
  surface?: Partial<AnnotationLineLabelSurfaceOptions>;
  layout?: Partial<AnnotationLineLabelLayoutOptions>;
  collision?: Partial<AnnotationLineLabelCollisionOptions>;
}>;

export type AnnotationLineLabelPlacementDefaults = Readonly<{
  verticalFlippedBaselineOffsetPx: number;
  verticalBaselineAngleEpsilonRad: Radians;
  sideHysteresisPx: number;
  upperSideGapFactor: number;
  upperSideGapNormalYEpsilon: number;
}>;

export const annotationLineLabelDefaults: AnnotationLineLabelOptions =
  Object.freeze({
    appearance: Object.freeze({
      themeStyle: ANNOTATION_THEME_STYLE.BRIGHT_ON_DARK,
    }),
    text: Object.freeze({
      fontFamily: typographyDefaults.fontFamily,
      fontWeight: typographyDefaults.lineLabelFontWeight,
    }),
    background: Object.freeze({
      style: ANNOTATION_LINE_LABEL_BACKGROUND_STYLE.TEXT_ECHO_DARKEN,
    }),
    surface: Object.freeze({}),
    layout: Object.freeze({
      shortEdgeOffsetPx: -2,
    }),
    collision: Object.freeze({
      allowEarlyRemoval: true,
      resolutionStrategy:
        ANNOTATION_LINE_LABEL_COLLISION_RESOLUTION_STRATEGY.MOVE_ON_LINE,
      anchorSlideStepRatio: 0.1,
      maxAnchorSlideDeltaRatio: 0.3,
    }),
  });

export const annotationLineLabelPlacementDefaults: AnnotationLineLabelPlacementDefaults =
  Object.freeze({
    verticalFlippedBaselineOffsetPx: 6,
    verticalBaselineAngleEpsilonRad: 1e-9 as Radians,
    sideHysteresisPx: 1.5,
    upperSideGapFactor: 0.15,
    upperSideGapNormalYEpsilon: 1e-3,
  });

export const resolveAnnotationLineLabelOptions = (
  options?: PartialAnnotationLineLabelOptions
): AnnotationLineLabelOptions => ({
  appearance: {
    ...annotationLineLabelDefaults.appearance,
    ...options?.appearance,
  },
  text: {
    ...annotationLineLabelDefaults.text,
    ...options?.text,
    echo:
      options?.text?.echo === undefined &&
      annotationLineLabelDefaults.text.echo === undefined
        ? undefined
        : {
            ...annotationLineLabelDefaults.text.echo,
            ...options?.text?.echo,
          },
  },
  background: {
    ...annotationLineLabelDefaults.background,
    ...options?.background,
  },
  surface: {
    ...annotationLineLabelDefaults.surface,
    ...options?.surface,
  },
  layout: {
    ...annotationLineLabelDefaults.layout,
    ...options?.layout,
  },
  collision: {
    ...annotationLineLabelDefaults.collision,
    ...options?.collision,
  },
});
