import { COLORS_HEX } from "@carma-commons/utils";
import { rgb } from "d3-color";

import { runtimeMeasurementVisualDefaults } from "./measurementVisualDefaults";
import type {
  AnnotationMeasurementQualitativeColorScheme,
  AnnotationMeasurementSelectedHighlightPalette,
} from "./annotationMeasurementLabelThemes";

const annotationMeasurementPrimaryReducedColor = rgb(
  COLORS_HEX.ACCENT_MEASUREMENTS
).brighter(0.1);

annotationMeasurementPrimaryReducedColor.opacity = 0.5;

export const ANNOTATION_MEASUREMENT_TEXT_COLOR = "rgb(248, 250, 252)";

export const ANNOTATION_MEASUREMENT_SELECTED_HIGHLIGHT_PALETTE = Object.freeze({
  backgroundColor: "rgba(15, 23, 42, 0.92)",
  hoverBackgroundColor: "rgba(30, 41, 59, 0.9)",
  textColor: ANNOTATION_MEASUREMENT_TEXT_COLOR,
  glowColor: "rgb(255, 255, 255)",
  glowRadiusPx: 5,
  preserveFillOnSelection: true,
} satisfies AnnotationMeasurementSelectedHighlightPalette);

export const ANNOTATION_MEASUREMENT_SHARED_COLOR_SCHEME = Object.freeze({
  id: "accent-measurements",
  label: "Measurements · Accent",
  colorPrimaryReduced: annotationMeasurementPrimaryReducedColor.toString(),
  colorPrimary: COLORS_HEX.ACCENT_MEASUREMENTS,
  lineColor: runtimeMeasurementVisualDefaults.colors.surface,
  textColor: ANNOTATION_MEASUREMENT_TEXT_COLOR,
} satisfies AnnotationMeasurementQualitativeColorScheme);

export const ANNOTATION_MEASUREMENT_QUALITATIVE_DARK_COLOR_SCHEMES =
  Object.freeze([
    ANNOTATION_MEASUREMENT_SHARED_COLOR_SCHEME,
  ] satisfies readonly AnnotationMeasurementQualitativeColorScheme[]);
