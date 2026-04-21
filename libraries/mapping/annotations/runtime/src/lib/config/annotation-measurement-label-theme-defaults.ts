import { COLORS_HEX } from "@carma-commons/utils";
import {
  getAnnotationMeasurementTextCssColor,
  getAnnotationSelectionCssColor,
  getAnnotationSurfaceStrokeCssColor,
} from "@carma-mapping/annotations/core";
import { rgb } from "d3-color";

import { measurementVisualDefaults } from "./measurement-visual-defaults";
import type {
  StoredAnnotationQualitativeColorScheme,
  StoredAnnotationSelectedHighlightPalette,
} from "./annotation-measurement-label-themes";

const annotationMeasurementPrimaryReducedColor = rgb(
  COLORS_HEX.ACCENT_MEASUREMENTS
).brighter(0.1);

annotationMeasurementPrimaryReducedColor.opacity = 0.5;

export const ANNOTATION_MEASUREMENT_TEXT_COLOR =
  getAnnotationMeasurementTextCssColor();

export const ANNOTATION_MEASUREMENT_SELECTED_HIGHLIGHT_PALETTE = Object.freeze({
  backgroundColor: getAnnotationSelectionCssColor("background"),
  hoverBackgroundColor: getAnnotationSelectionCssColor("hoverBackground"),
  textColor: ANNOTATION_MEASUREMENT_TEXT_COLOR,
  glowColor: getAnnotationSurfaceStrokeCssColor(1),
  glowRadiusPx: 5,
  preserveFillOnSelection: true,
} satisfies StoredAnnotationSelectedHighlightPalette);

export const ANNOTATION_MEASUREMENT_SHARED_COLOR_SCHEME = Object.freeze({
  id: "accent-measurements",
  label: "Measurements · Accent",
  colorPrimaryReduced: annotationMeasurementPrimaryReducedColor.toString(),
  colorPrimary: COLORS_HEX.ACCENT_MEASUREMENTS,
  lineColor: measurementVisualDefaults.colors.surface,
  textColor: ANNOTATION_MEASUREMENT_TEXT_COLOR,
} satisfies StoredAnnotationQualitativeColorScheme);

export const ANNOTATION_MEASUREMENT_QUALITATIVE_DARK_COLOR_SCHEMES =
  Object.freeze([
    ANNOTATION_MEASUREMENT_SHARED_COLOR_SCHEME,
  ] satisfies readonly StoredAnnotationQualitativeColorScheme[]);
