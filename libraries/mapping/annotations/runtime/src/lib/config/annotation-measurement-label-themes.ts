import { type AnnotationShortLabelKind } from "@carma-mapping/annotations/core";

import { annotationTypographyDefaults } from "./annotation-typography-defaults";
import {
  ANNOTATION_MEASUREMENT_SELECTED_HIGHLIGHT_PALETTE,
  ANNOTATION_MEASUREMENT_SHARED_COLOR_SCHEME,
} from "./annotation-measurement-label-theme-defaults";

export type AnnotationMeasurementQualitativeColorScheme = Readonly<{
  id: string;
  label: string;
  colorPrimaryReduced: string;
  colorPrimary: string;
  lineColor: string;
  textColor: string;
}>;

export type AnnotationMeasurementSelectedHighlightPalette = Readonly<{
  backgroundColor: string;
  hoverBackgroundColor: string;
  textColor: string;
  glowColor: string;
  glowRadiusPx: number;
  preserveFillOnSelection: boolean;
}>;

export type AnnotationMeasurementLabelTheme = Readonly<{
  scheme: AnnotationMeasurementQualitativeColorScheme;
  fontFamily: string;
  contentFontWeight: number;
  badgeFontWeight: number;
  selection: AnnotationMeasurementSelectedHighlightPalette;
}>;

export const ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME = Object.freeze({
  scheme: ANNOTATION_MEASUREMENT_SHARED_COLOR_SCHEME,
  fontFamily: annotationTypographyDefaults.fontFamily,
  contentFontWeight: annotationTypographyDefaults.lineLabelFontWeight,
  badgeFontWeight: annotationTypographyDefaults.badgeFontWeight,
  selection: ANNOTATION_MEASUREMENT_SELECTED_HIGHLIGHT_PALETTE,
} satisfies AnnotationMeasurementLabelTheme);

export const resolveAnnotationMeasurementLabelTheme = (
  _toolType?: AnnotationShortLabelKind
): AnnotationMeasurementLabelTheme =>
  ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME;
