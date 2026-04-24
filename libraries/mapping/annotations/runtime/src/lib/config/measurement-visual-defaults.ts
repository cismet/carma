import {
  ANNOTATION_LINE_COMPONENT_KINDS,
  getAnnotationLineComponentCssColor,
  getAnnotationLineComponentLabelAccentCssColor,
  getAnnotationSurfaceStrokeCssColor,
} from "@carma-mapping/annotations/core";
import { resolveDisplayP3WhiteCssColor } from "@carma-commons/utils";
import { MEASUREMENT_LINE_STYLE_DEFAULTS } from "./measurement-line-style-options";

export type EdgeVisualStyle = {
  stroke: string;
  strokeWidth: number;
  overlayDashPattern?: string;
  dashed?: true;
};

export type PointMarkerVisualStyle = {
  pixelSize: number;
  fill: string;
  outline: string;
  outlineWidth: number;
};

export type MeasurementVisualDefaults = {
  colors: {
    neutral: string;
    accent: string;
    preview: string;
    surface: string;
    transparent: string;
    components: {
      direct: string;
      vertical: string;
      horizontal: string;
    };
    componentLabelAccents: {
      direct: string;
      vertical: string;
      horizontal: string;
    };
  };
  sizes: {
    edgeStrokeWidth: number;
    pointPixelSize: number;
    previewPointPixelSize: number;
    pointOutlineWidth: number;
  };
  patterns: {
    edgeDashPattern: string;
  };
};

export type MeasurementVisualStyles = {
  edge: EdgeVisualStyle;
  point: PointMarkerVisualStyle;
};

export type MeasurementVisualSelectionStyleOverrides = {
  edge: Partial<EdgeVisualStyle>;
  point: Partial<PointMarkerVisualStyle>;
};

const measurementVisualColorDefaults = Object.freeze({
  previewAlpha: 0.9,
  surfaceAlpha: 0.92,
});

export const measurementVisualDefaults: MeasurementVisualDefaults = {
  colors: {
    neutral: getAnnotationSurfaceStrokeCssColor(1),
    accent: getAnnotationSurfaceStrokeCssColor(1),
    preview: getAnnotationSurfaceStrokeCssColor(
      measurementVisualColorDefaults.previewAlpha
    ),
    surface: resolveDisplayP3WhiteCssColor(
      measurementVisualColorDefaults.surfaceAlpha
    ),
    transparent: "transparent",
    components: {
      direct: getAnnotationLineComponentCssColor(
        ANNOTATION_LINE_COMPONENT_KINDS.DIRECT
      ),
      vertical: getAnnotationLineComponentCssColor(
        ANNOTATION_LINE_COMPONENT_KINDS.VERTICAL
      ),
      horizontal: getAnnotationLineComponentCssColor(
        ANNOTATION_LINE_COMPONENT_KINDS.HORIZONTAL
      ),
    },
    componentLabelAccents: {
      direct: getAnnotationLineComponentLabelAccentCssColor(
        ANNOTATION_LINE_COMPONENT_KINDS.DIRECT
      ),
      vertical: getAnnotationLineComponentLabelAccentCssColor(
        ANNOTATION_LINE_COMPONENT_KINDS.VERTICAL
      ),
      horizontal: getAnnotationLineComponentLabelAccentCssColor(
        ANNOTATION_LINE_COMPONENT_KINDS.HORIZONTAL
      ),
    },
  },
  sizes: {
    edgeStrokeWidth: MEASUREMENT_LINE_STYLE_DEFAULTS.strokeWidthPx,
    pointPixelSize: 10,
    previewPointPixelSize: 10,
    pointOutlineWidth: 1,
  },
  patterns: {
    edgeDashPattern: MEASUREMENT_LINE_STYLE_DEFAULTS.overlayDashPattern,
  },
};

export const measurementVisualStyles: MeasurementVisualStyles = Object.freeze({
  edge: Object.freeze({
    stroke: measurementVisualDefaults.colors.accent,
    strokeWidth: measurementVisualDefaults.sizes.edgeStrokeWidth,
    overlayDashPattern: measurementVisualDefaults.patterns.edgeDashPattern,
  } satisfies EdgeVisualStyle),
  point: Object.freeze({
    pixelSize: measurementVisualDefaults.sizes.pointPixelSize,
    fill: measurementVisualDefaults.colors.transparent,
    outline: measurementVisualDefaults.colors.surface,
    outlineWidth: measurementVisualDefaults.sizes.pointOutlineWidth,
  } satisfies PointMarkerVisualStyle),
});

export const measurementVisualSelectionStyleOverrides: MeasurementVisualSelectionStyleOverrides =
  Object.freeze({
    edge: Object.freeze({
      stroke: measurementVisualDefaults.colors.neutral,
    } satisfies Partial<EdgeVisualStyle>),
    point: Object.freeze({
      outline: measurementVisualDefaults.colors.neutral,
    } satisfies Partial<PointMarkerVisualStyle>),
  });

export const withEdgeVisualStyle = (
  base: EdgeVisualStyle,
  overrides: Partial<EdgeVisualStyle> = {}
): EdgeVisualStyle => ({
  ...base,
  ...overrides,
});

export const withPointMarkerVisualStyle = (
  base: PointMarkerVisualStyle,
  overrides: Partial<PointMarkerVisualStyle> = {}
): PointMarkerVisualStyle => ({
  ...base,
  ...overrides,
});

export const applySelectedEdgeVisualStyle = (
  base: EdgeVisualStyle
): EdgeVisualStyle =>
  withEdgeVisualStyle(base, measurementVisualSelectionStyleOverrides.edge);

export const applySelectedPointMarkerVisualStyle = (
  base: PointMarkerVisualStyle
): PointMarkerVisualStyle =>
  withPointMarkerVisualStyle(
    base,
    measurementVisualSelectionStyleOverrides.point
  );
