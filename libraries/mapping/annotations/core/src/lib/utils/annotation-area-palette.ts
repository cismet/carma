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

const formatRgbaCss = ([red, green, blue]: Rgb255, alpha: number): string =>
  `rgba(${red}, ${green}, ${blue}, ${alpha})`;

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

/**
 * Host overrides of the area palette: other colours per area type, other
 * fill alphas. Everything else of the area style (the engine's fill
 * pattern, the occlusion traces) is set beside it in the host's tool
 * settings; this part is what the tools themselves colour with.
 */
export type AnnotationAreaPaletteOptions = {
  fillAlpha?: number;
  selectedFillAlpha?: number;
  rgb255ByType?: Partial<Record<PolygonType, Rgb255>>;
};

export type AnnotationAreaPalette = {
  rgb255: (type: PolygonType) => Rgb255;
  fillCssColor: (type: PolygonType, selected: boolean) => string;
  cssColor: (type: PolygonType, alpha: number) => string;
};

const isUnitAlpha = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

export const createAnnotationAreaPalette = (
  options: AnnotationAreaPaletteOptions = {}
): AnnotationAreaPalette => {
  const fillAlpha = isUnitAlpha(options.fillAlpha)
    ? options.fillAlpha
    : annotationAreaPalette.fillAlpha;
  const selectedFillAlpha = isUnitAlpha(options.selectedFillAlpha)
    ? options.selectedFillAlpha
    : annotationAreaPalette.selectedFillAlpha;
  const rgb255 = (type: PolygonType): Rgb255 =>
    options.rgb255ByType?.[type] ?? annotationAreaPalette.rgb255ByType[type];
  return {
    rgb255,
    fillCssColor: (type, selected) =>
      formatRgbaCss(rgb255(type), selected ? selectedFillAlpha : fillAlpha),
    cssColor: (type, alpha) => formatRgbaCss(rgb255(type), alpha),
  };
};

export const defaultAnnotationAreaPalette: AnnotationAreaPalette =
  createAnnotationAreaPalette();
