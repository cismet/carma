import { COLORS_HEX } from "@carma-commons/utils";
import { rgb } from "d3-color";

import { annotationVisualDefaults } from "./annotation-visual-defaults";
import { ANNOTATION_THEME } from "./annotation-theme";
import type { StoredAnnotationQualitativeColorScheme } from "./annotation-label-themes";

const annotationPrimaryReducedColor = rgb(
  COLORS_HEX.ACCENT_MEASUREMENTS
).brighter(0.1);

annotationPrimaryReducedColor.opacity = 0.5;

export const ANNOTATION_SHARED_COLOR_SCHEME = Object.freeze({
  id: "accent-measurements",
  label: "Measurements · Accent",
  colorPrimaryReduced: annotationPrimaryReducedColor.toString(),
  colorPrimary: COLORS_HEX.ACCENT_MEASUREMENTS,
  lineColor: annotationVisualDefaults.colors.surface,
  textColor: ANNOTATION_THEME.label.textColor,
} satisfies StoredAnnotationQualitativeColorScheme);

export const ANNOTATION_QUALITATIVE_DARK_COLOR_SCHEMES = Object.freeze([
  ANNOTATION_SHARED_COLOR_SCHEME,
] satisfies readonly StoredAnnotationQualitativeColorScheme[]);
