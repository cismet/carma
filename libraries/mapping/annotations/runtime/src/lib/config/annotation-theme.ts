import {
  getAnnotationLabelTextCssColor,
  getAnnotationSelectionCssColor,
  getAnnotationSurfaceStrokeCssColor,
} from "@carma-mapping/annotations/core";
import type { StoredAnnotationSelectedHighlightPalette } from "./annotation-label-themes";

const annotationLabelTextColor = getAnnotationLabelTextCssColor();

export const ANNOTATION_THEME = Object.freeze({
  style: Object.freeze({
    DARK_ON_BRIGHT: "dark-on-bright",
    BRIGHT_ON_DARK: "bright-on-dark",
  }),
  label: Object.freeze({
    textColor: annotationLabelTextColor,
  }),
  selection: Object.freeze({
    highlightPalette: Object.freeze({
      backgroundColor: getAnnotationSelectionCssColor("background"),
      hoverBackgroundColor: getAnnotationSelectionCssColor("hoverBackground"),
      textColor: annotationLabelTextColor,
      glowColor: getAnnotationSurfaceStrokeCssColor(1),
      glowRadiusPx: 5,
      preserveFillOnSelection: true,
    } satisfies StoredAnnotationSelectedHighlightPalette),
  }),
  lineLabel: Object.freeze({
    backgroundStyle: Object.freeze({
      SOFT_RECT_FADE: "soft-rect-fade",
      TEXT_ECHO_DARKEN: "text-echo-darken",
    }),
  }),
} as const);

export type AnnotationTheme = typeof ANNOTATION_THEME;
export type AnnotationThemeStyle =
  (typeof ANNOTATION_THEME.style)[keyof typeof ANNOTATION_THEME.style];
