import { type AnnotationType } from "@carma-mapping/annotations/core";

import { typographyDefaults } from "./annotation-typography-defaults";
import { ANNOTATION_SHARED_COLOR_SCHEME } from "./annotation-label-theme-defaults";
import { ANNOTATION_THEME } from "./annotation-theme";

export type StoredAnnotationQualitativeColorScheme = Readonly<{
  id: string;
  label: string;
  colorPrimaryReduced: string;
  colorPrimary: string;
  lineColor: string;
  textColor: string;
}>;

export type StoredAnnotationSelectedHighlightPalette = Readonly<{
  backgroundColor: string;
  hoverBackgroundColor: string;
  textColor: string;
  glowColor: string;
  glowRadiusPx: number;
  preserveFillOnSelection: boolean;
}>;

export type StoredAnnotationLabelTheme = Readonly<{
  scheme: StoredAnnotationQualitativeColorScheme;
  fontFamily: string;
  contentFontWeight: number;
  badgeFontWeight: number;
  selection: StoredAnnotationSelectedHighlightPalette;
}>;

export const ANNOTATION_DEFAULT_LABEL_THEME = Object.freeze({
  scheme: ANNOTATION_SHARED_COLOR_SCHEME,
  fontFamily: typographyDefaults.fontFamily,
  contentFontWeight: typographyDefaults.lineLabelFontWeight,
  badgeFontWeight: typographyDefaults.badgeFontWeight,
  selection: ANNOTATION_THEME.selection.highlightPalette,
} satisfies StoredAnnotationLabelTheme);

export const resolveStoredAnnotationLabelTheme = (
  _toolType?: AnnotationType
): StoredAnnotationLabelTheme => ANNOTATION_DEFAULT_LABEL_THEME;
