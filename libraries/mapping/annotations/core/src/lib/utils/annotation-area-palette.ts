import type { Rgb255 } from "@carma-commons/utils";

import { ANNOTATION_TYPES, type PolygonType } from "../types/annotation-types";

export const annotationAreaPalette = Object.freeze({
  fillAlpha: 0.25,
  selectedFillAlpha: 0.35,
  rgb255ByType: {
    [ANNOTATION_TYPES.AREA_VERTICAL]: [112, 168, 255],
    [ANNOTATION_TYPES.AREA_GROUND]: [107, 188, 123],
    [ANNOTATION_TYPES.AREA_PLANAR]: [239, 223, 145],
  } as const satisfies Record<PolygonType, Rgb255>,
});

const formatRgbaCss = (
  [red, green, blue]: Rgb255,
  alpha: number
): string => `rgba(${red}, ${green}, ${blue}, ${alpha})`;

export const getAnnotationAreaRgb255 = (type: PolygonType): Rgb255 =>
  annotationAreaPalette.rgb255ByType[type];

export const getAnnotationAreaFillCssColor = (
  type: PolygonType,
  selected: boolean
): string =>
  formatRgbaCss(
    getAnnotationAreaRgb255(type),
    selected
      ? annotationAreaPalette.selectedFillAlpha
      : annotationAreaPalette.fillAlpha
  );

export const getAnnotationAreaCssColor = (
  type: PolygonType,
  alpha: number
): string => formatRgbaCss(getAnnotationAreaRgb255(type), alpha);
