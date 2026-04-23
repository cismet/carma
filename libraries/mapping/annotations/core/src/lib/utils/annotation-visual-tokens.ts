import type { Rgb255 } from "@carma-commons/utils";

import {
  ANNOTATION_TYPES,
  type AnnotationType,
  type AnnotationTypes,
} from "../types/annotation-types";
import {
  getAnnotationAreaCssColor,
  getAnnotationAreaRgb255,
} from "./annotation-area-palette";

export const ANNOTATION_LINE_COMPONENT_KINDS = {
  DIRECT: "direct",
  VERTICAL: "vertical",
  HORIZONTAL: "horizontal",
} as const;

export type AnnotationLineComponentKind =
  (typeof ANNOTATION_LINE_COMPONENT_KINDS)[keyof typeof ANNOTATION_LINE_COMPONENT_KINDS];

export type AnnotationTextTone = "dark" | "light";

type AnnotationSolidBadgeType =
  | AnnotationTypes["POINT"]
  | AnnotationTypes["DISTANCE"]
  | AnnotationTypes["POLYLINE"]
  | AnnotationTypes["LABEL"];

export const annotationVisualPalette = Object.freeze({
  textRgb255: {
    dark: [17, 24, 39],
    light: [255, 255, 255],
  } as const satisfies Record<AnnotationTextTone, Rgb255>,
  measurementTextRgb255: [248, 250, 252] as const satisfies Rgb255,
  shortLabelRgb255ByType: {
    [ANNOTATION_TYPES.POINT]: [200, 200, 200],
    [ANNOTATION_TYPES.DISTANCE]: [102, 126, 234],
    [ANNOTATION_TYPES.POLYLINE]: [226, 178, 60],
    [ANNOTATION_TYPES.LABEL]: [88, 152, 255],
  } as const satisfies Record<AnnotationSolidBadgeType, Rgb255>,
  surfaceRgb255: {
    stroke: [255, 255, 255],
    accent: [246, 248, 255],
  } as const,
  lineComponentRgb255ByKind: {
    [ANNOTATION_LINE_COMPONENT_KINDS.DIRECT]: [255, 255, 255],
    [ANNOTATION_LINE_COMPONENT_KINDS.VERTICAL]: [111, 168, 255],
    [ANNOTATION_LINE_COMPONENT_KINDS.HORIZONTAL]: [188, 194, 102],
  } as const satisfies Record<AnnotationLineComponentKind, Rgb255>,
  selectionRgb255: {
    background: [15, 23, 42],
    hoverBackground: [30, 41, 59],
    glow: [255, 255, 255],
  } as const,
});

export const annotationVisualDefaults = Object.freeze({
  alpha: {
    text: {
      dark: 0.9,
      light: 1,
    },
    shortLabelBackgroundByType: {
      [ANNOTATION_TYPES.POINT]: 0.92,
      [ANNOTATION_TYPES.DISTANCE]: 0.95,
      [ANNOTATION_TYPES.POLYLINE]: 0.95,
      [ANNOTATION_TYPES.LABEL]: 0.95,
      area: 0.95,
    },
    lineComponentByKind: {
      [ANNOTATION_LINE_COMPONENT_KINDS.DIRECT]: 1,
      [ANNOTATION_LINE_COMPONENT_KINDS.VERTICAL]: 0.96,
      [ANNOTATION_LINE_COMPONENT_KINDS.HORIZONTAL]: 0.95,
    },
    lineComponentLabelAccentByKind: {
      [ANNOTATION_LINE_COMPONENT_KINDS.DIRECT]: 0.34,
      [ANNOTATION_LINE_COMPONENT_KINDS.VERTICAL]: 0.54,
      [ANNOTATION_LINE_COMPONENT_KINDS.HORIZONTAL]: 0.5,
    },
    selection: {
      background: 0.92,
      hoverBackground: 0.9,
      glow: 1,
    },
    surfaceStroke: 0.95,
  },
});

export const formatAnnotationRgbCss = ([red, green, blue]: Rgb255): string =>
  `rgb(${red}, ${green}, ${blue})`;

export const formatAnnotationRgbaCss = (
  [red, green, blue]: Rgb255,
  alpha: number
): string => `rgba(${red}, ${green}, ${blue}, ${alpha})`;

export const getAnnotationTextCssColor = (
  tone: AnnotationTextTone,
  alpha: number = annotationVisualDefaults.alpha.text[tone]
): string =>
  formatAnnotationRgbaCss(annotationVisualPalette.textRgb255[tone], alpha);

export const getAnnotationSurfaceStrokeCssColor = (
  alpha: number = annotationVisualDefaults.alpha.surfaceStroke
): string =>
  formatAnnotationRgbaCss(annotationVisualPalette.surfaceRgb255.stroke, alpha);

export const getAnnotationSurfaceAccentCssColor = (
  alpha: number = annotationVisualDefaults.alpha.surfaceStroke
): string =>
  formatAnnotationRgbaCss(annotationVisualPalette.surfaceRgb255.accent, alpha);

export const getAnnotationLineComponentCssColor = (
  kind: AnnotationLineComponentKind,
  alpha: number = annotationVisualDefaults.alpha.lineComponentByKind[kind]
): string =>
  formatAnnotationRgbaCss(
    annotationVisualPalette.lineComponentRgb255ByKind[kind],
    alpha
  );

export const getAnnotationLineComponentLabelAccentCssColor = (
  kind: AnnotationLineComponentKind,
  alpha: number = annotationVisualDefaults.alpha.lineComponentLabelAccentByKind[
    kind
  ]
): string =>
  formatAnnotationRgbaCss(
    annotationVisualPalette.lineComponentRgb255ByKind[kind],
    alpha
  );

const isAreaAnnotationType = (
  type: AnnotationType
): type is
  | AnnotationTypes["AREA_GROUND"]
  | AnnotationTypes["AREA_PLANAR"]
  | AnnotationTypes["AREA_VERTICAL"] =>
  type === ANNOTATION_TYPES.AREA_GROUND ||
  type === ANNOTATION_TYPES.AREA_PLANAR ||
  type === ANNOTATION_TYPES.AREA_VERTICAL;

export const getAnnotationShortLabelBackgroundCssColor = (
  type: AnnotationType
): string => {
  if (isAreaAnnotationType(type)) {
    return getAnnotationAreaCssColor(
      type,
      annotationVisualDefaults.alpha.shortLabelBackgroundByType.area
    );
  }

  return formatAnnotationRgbaCss(
    annotationVisualPalette.shortLabelRgb255ByType[type],
    annotationVisualDefaults.alpha.shortLabelBackgroundByType[type]
  );
};

export const getAnnotationShortLabelBackgroundRgb255 = (
  type: AnnotationType
): Rgb255 =>
  isAreaAnnotationType(type)
    ? getAnnotationAreaRgb255(type)
    : annotationVisualPalette.shortLabelRgb255ByType[type];

export const getAnnotationSelectionCssColor = (
  role: keyof typeof annotationVisualPalette.selectionRgb255,
  alpha: number = annotationVisualDefaults.alpha.selection[role]
): string =>
  formatAnnotationRgbaCss(annotationVisualPalette.selectionRgb255[role], alpha);

export const getAnnotationMeasurementTextCssColor = (
  alpha: number = 1
): string =>
  formatAnnotationRgbaCss(annotationVisualPalette.measurementTextRgb255, alpha);
