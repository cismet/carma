import {
  REFERENCE_OBJECT_SCALING_MODES,
  type ReferenceObjectScalingMode,
} from "@carma-commons/math";

import type { CssPixels, Milliseconds, Ratio } from "@carma-units";
import type { AnnotationDiscSizingOptions } from "@carma-mapping/annotations/core";

/** Storybook: Mapping/Annotations/MapLibre Measurement Scene → ScalingConfiguration. */
export type AnnotationDiscReferenceOptions = Readonly<
  AnnotationDiscSizingOptions & {
    /** How long an unchanged radius label stays visible. */
    radiusLabelVisibleDurationMs: Milliseconds;
    radiusLabelFadeDurationMs: Milliseconds;
    /** Visual transition only; selected 1/2/5 world radii remain discrete. Zero disables it. */
    resizeAnimationDurationMs: Milliseconds;
    centerCircleDiameterCssPx: CssPixels;
    /** Reuses the visible line renderer's depth-tested darkening halo. */
    crosshairHalo: boolean;
  }
>;

export const ANNOTATION_DISC_REFERENCE_DEFAULTS: AnnotationDiscReferenceOptions =
  Object.freeze({
    targetScreenRadiusCssPx: 64 as CssPixels,
    minimumScreenRadiusCssPx: 10 as CssPixels,
    maximumViewportRadiusRatio: 0.5 as Ratio,
    sceneResizeFactor: 10 as Ratio,
    resizeHysteresisRatio: 0.15 as Ratio,
    radiusLabelVisibleDurationMs: 3000 as Milliseconds,
    radiusLabelFadeDurationMs: 250 as Milliseconds,
    resizeAnimationDurationMs: 200 as Milliseconds,
    centerCircleDiameterCssPx: 6 as CssPixels,
    crosshairHalo: true,
  });

export type AnnotationReferenceObjectSizingOptions = {
  scalingMode: ReferenceObjectScalingMode;
  worldRadiusMeters: number;
  targetScreenRadiusCssPx: number;
  resizeWorldRadiusToScreenTarget: boolean;
  resizeStepFactor: number;
  quantizeWorldRadius: boolean;
  /** Shared Three query/edit disc policy; omitted engines retain the existing defaults above. */
  discSizing?: Partial<AnnotationDiscReferenceOptions>;
};

export const ANNOTATION_REFERENCE_OBJECT_SIZING_DEFAULTS = {
  scalingMode: REFERENCE_OBJECT_SCALING_MODES.SCREEN,
  worldRadiusMeters: 3,
  targetScreenRadiusCssPx: 48,
  resizeWorldRadiusToScreenTarget: false,
  resizeStepFactor: 4,
  quantizeWorldRadius: false,
} satisfies AnnotationReferenceObjectSizingOptions;
