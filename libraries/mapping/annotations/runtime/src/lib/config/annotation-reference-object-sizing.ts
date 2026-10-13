import {
  REFERENCE_OBJECT_SCALING_MODES,
  type ReferenceObjectScalingMode,
} from "@carma-commons/math";

import type { CssPixels, Ratio } from "@carma-units";

/** Storybook: Mapping/Annotations/MapLibre Measurement Scene → ScalingConfiguration. */
export type AnnotationPointQueryDiscSizingOptions = Readonly<{
  targetScreenRadiusCssPx: CssPixels;
  minimumScreenRadiusCssPx: CssPixels;
  maximumViewportRadiusRatio: Ratio;
  sceneResizeFactor: Ratio;
  resizeHysteresisRatio: Ratio;
}>;

export const ANNOTATION_POINT_QUERY_DISC_SIZING_DEFAULTS: AnnotationPointQueryDiscSizingOptions =
  Object.freeze({
    targetScreenRadiusCssPx: 64 as CssPixels,
    minimumScreenRadiusCssPx: 10 as CssPixels,
    maximumViewportRadiusRatio: 0.5 as Ratio,
    sceneResizeFactor: 10 as Ratio,
    resizeHysteresisRatio: 0.15 as Ratio,
  });

export type AnnotationReferenceObjectSizingOptions = {
  scalingMode: ReferenceObjectScalingMode;
  worldRadiusMeters: number;
  targetScreenRadiusCssPx: number;
  resizeWorldRadiusToScreenTarget: boolean;
  resizeStepFactor: number;
  quantizeWorldRadius: boolean;
  /** Scene query disc only; the existing fields still size the edit gizmo. */
  pointQueryDiscSizing?: Partial<AnnotationPointQueryDiscSizingOptions>;
};

export const ANNOTATION_REFERENCE_OBJECT_SIZING_DEFAULTS = {
  scalingMode: REFERENCE_OBJECT_SCALING_MODES.SCREEN,
  worldRadiusMeters: 3,
  targetScreenRadiusCssPx: 48,
  resizeWorldRadiusToScreenTarget: false,
  resizeStepFactor: 4,
  quantizeWorldRadius: false,
} satisfies AnnotationReferenceObjectSizingOptions;
