import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  type AnnotationShortLabelKind,
} from "@carma-mapping/annotations/core";

import { annotationTypographyDefaults } from "./annotationTypographyDefaults";

export const ANNOTATION_MEASUREMENT_TEXT_COLOR =
  "rgba(248, 250, 252, 0.98)";

export type AnnotationMeasurementQualitativeColorScheme = Readonly<{
  id: string;
  label: string;
  labelBackgroundColor: string;
  badgeBackgroundColor: string;
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
  toolType: AnnotationShortLabelKind;
  scheme: AnnotationMeasurementQualitativeColorScheme;
  fontFamily: string;
  contentFontWeight: number;
  badgeFontWeight: number;
  selection: AnnotationMeasurementSelectedHighlightPalette;
}>;

export const ANNOTATION_MEASUREMENT_SELECTED_HIGHLIGHT_PALETTE =
  Object.freeze({
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    hoverBackgroundColor: "rgba(30, 41, 59, 0.9)",
    textColor: ANNOTATION_MEASUREMENT_TEXT_COLOR,
    glowColor: "rgba(255, 255, 255, 0.98)",
    glowRadiusPx: 5,
    preserveFillOnSelection: true,
  } satisfies AnnotationMeasurementSelectedHighlightPalette);

export const ANNOTATION_MEASUREMENT_QUALITATIVE_DARK_COLOR_SCHEMES =
  Object.freeze([
    {
      id: "cobalt-reference",
      label: "Kobalt · Referenz",
      labelBackgroundColor: "rgba(30, 64, 175, 0.78)",
      badgeBackgroundColor: "rgba(30, 58, 138, 0.98)",
      lineColor: "rgba(147, 197, 253, 0.88)",
      textColor: ANNOTATION_MEASUREMENT_TEXT_COLOR,
    },
    {
      id: "teal-status",
      label: "Teal · Status",
      labelBackgroundColor: "rgba(15, 118, 110, 0.78)",
      badgeBackgroundColor: "rgba(17, 94, 89, 0.98)",
      lineColor: "rgba(94, 234, 212, 0.86)",
      textColor: ANNOTATION_MEASUREMENT_TEXT_COLOR,
    },
    {
      id: "violet-analysis",
      label: "Violett · Analyse",
      labelBackgroundColor: "rgba(109, 40, 217, 0.78)",
      badgeBackgroundColor: "rgba(91, 33, 182, 0.98)",
      lineColor: "rgba(196, 181, 253, 0.88)",
      textColor: ANNOTATION_MEASUREMENT_TEXT_COLOR,
    },
    {
      id: "amber-notice",
      label: "Amber · Hinweis",
      labelBackgroundColor: "rgba(146, 64, 14, 0.8)",
      badgeBackgroundColor: "rgba(120, 53, 15, 0.98)",
      lineColor: "rgba(251, 191, 36, 0.88)",
      textColor: ANNOTATION_MEASUREMENT_TEXT_COLOR,
    },
    {
      id: "rose-review",
      label: "Rose · Prüfung",
      labelBackgroundColor: "rgba(190, 24, 93, 0.78)",
      badgeBackgroundColor: "rgba(157, 23, 77, 0.98)",
      lineColor: "rgba(251, 113, 133, 0.88)",
      textColor: ANNOTATION_MEASUREMENT_TEXT_COLOR,
    },
    {
      id: "emerald-surface",
      label: "Emerald · Fläche",
      labelBackgroundColor: "rgba(5, 150, 105, 0.78)",
      badgeBackgroundColor: "rgba(4, 120, 87, 0.98)",
      lineColor: "rgba(110, 231, 183, 0.88)",
      textColor: ANNOTATION_MEASUREMENT_TEXT_COLOR,
    },
    {
      id: "slate-note",
      label: "Slate · Notiz",
      labelBackgroundColor: "rgba(51, 65, 85, 0.82)",
      badgeBackgroundColor: "rgba(30, 41, 59, 0.98)",
      lineColor: "rgba(148, 163, 184, 0.88)",
      textColor: ANNOTATION_MEASUREMENT_TEXT_COLOR,
    },
  ] satisfies readonly AnnotationMeasurementQualitativeColorScheme[]);

const getQualitativeColorScheme = (
  id: string
): AnnotationMeasurementQualitativeColorScheme => {
  const colorScheme = ANNOTATION_MEASUREMENT_QUALITATIVE_DARK_COLOR_SCHEMES.find(
    (entry) => entry.id === id
  );

  if (!colorScheme) {
    throw new Error(
      `Unknown annotation measurement label color scheme: ${id}`
    );
  }

  return colorScheme;
};

export const ANNOTATION_MEASUREMENT_LABEL_THEME_BY_TOOL_TYPE =
  Object.freeze({
    [ANNOTATION_TYPE_POINT]: {
      toolType: ANNOTATION_TYPE_POINT,
      scheme: getQualitativeColorScheme("cobalt-reference"),
      fontFamily: annotationTypographyDefaults.fontFamily,
      contentFontWeight: 400,
      badgeFontWeight: annotationTypographyDefaults.badgeFontWeight,
      selection: ANNOTATION_MEASUREMENT_SELECTED_HIGHLIGHT_PALETTE,
    },
    [ANNOTATION_TYPE_DISTANCE]: {
      toolType: ANNOTATION_TYPE_DISTANCE,
      scheme: getQualitativeColorScheme("teal-status"),
      fontFamily: annotationTypographyDefaults.fontFamily,
      contentFontWeight: annotationTypographyDefaults.lineLabelFontWeight,
      badgeFontWeight: annotationTypographyDefaults.badgeFontWeight,
      selection: ANNOTATION_MEASUREMENT_SELECTED_HIGHLIGHT_PALETTE,
    },
    [ANNOTATION_TYPE_POLYLINE]: {
      toolType: ANNOTATION_TYPE_POLYLINE,
      scheme: getQualitativeColorScheme("amber-notice"),
      fontFamily: annotationTypographyDefaults.fontFamily,
      contentFontWeight: 400,
      badgeFontWeight: annotationTypographyDefaults.badgeFontWeight,
      selection: ANNOTATION_MEASUREMENT_SELECTED_HIGHLIGHT_PALETTE,
    },
    [ANNOTATION_TYPE_AREA_GROUND]: {
      toolType: ANNOTATION_TYPE_AREA_GROUND,
      scheme: getQualitativeColorScheme("emerald-surface"),
      fontFamily: annotationTypographyDefaults.fontFamily,
      contentFontWeight: 400,
      badgeFontWeight: annotationTypographyDefaults.badgeFontWeight,
      selection: ANNOTATION_MEASUREMENT_SELECTED_HIGHLIGHT_PALETTE,
    },
    [ANNOTATION_TYPE_AREA_PLANAR]: {
      toolType: ANNOTATION_TYPE_AREA_PLANAR,
      scheme: getQualitativeColorScheme("violet-analysis"),
      fontFamily: annotationTypographyDefaults.fontFamily,
      contentFontWeight: 400,
      badgeFontWeight: annotationTypographyDefaults.badgeFontWeight,
      selection: ANNOTATION_MEASUREMENT_SELECTED_HIGHLIGHT_PALETTE,
    },
    [ANNOTATION_TYPE_AREA_VERTICAL]: {
      toolType: ANNOTATION_TYPE_AREA_VERTICAL,
      scheme: getQualitativeColorScheme("rose-review"),
      fontFamily: annotationTypographyDefaults.fontFamily,
      contentFontWeight: 400,
      badgeFontWeight: annotationTypographyDefaults.badgeFontWeight,
      selection: ANNOTATION_MEASUREMENT_SELECTED_HIGHLIGHT_PALETTE,
    },
    [ANNOTATION_TYPE_LABEL]: {
      toolType: ANNOTATION_TYPE_LABEL,
      scheme: getQualitativeColorScheme("slate-note"),
      fontFamily: annotationTypographyDefaults.fontFamily,
      contentFontWeight: 400,
      badgeFontWeight: annotationTypographyDefaults.badgeFontWeight,
      selection: ANNOTATION_MEASUREMENT_SELECTED_HIGHLIGHT_PALETTE,
    },
  } satisfies Record<AnnotationShortLabelKind, AnnotationMeasurementLabelTheme>);

export const resolveAnnotationMeasurementLabelTheme = (
  toolType: AnnotationShortLabelKind
): AnnotationMeasurementLabelTheme =>
  ANNOTATION_MEASUREMENT_LABEL_THEME_BY_TOOL_TYPE[toolType];
