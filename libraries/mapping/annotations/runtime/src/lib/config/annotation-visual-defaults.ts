import {
  ANNOTATION_LINE_COMPONENT_KINDS,
  getAnnotationLineComponentCssColor,
  getAnnotationLineComponentLabelAccentCssColor,
  getAnnotationSurfaceStrokeCssColor,
} from "@carma-mapping/annotations/core";
import { resolveDisplayP3WhiteCssColor } from "@carma-commons/utils";
import { ANNOTATION_LINE_STYLE_DEFAULTS } from "./annotation-line-style-options";

export type EdgeVisualStyle = {
  stroke: string;
  strokeWidth: number;
  overlayDashPattern?: string;
  overlayDashed?: true;
};

export type PointMarkerVisualStyle = {
  pixelSize: number;
  fill: string;
  outline: string;
  outlineWidth: number;
};

export type AnnotationVisualDefaults = {
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
    pointOutlineWidth: number;
  };
  patterns: {
    edgeDashPattern: string;
  };
};

export type AnnotationVisualStyles = {
  edge: EdgeVisualStyle;
  point: PointMarkerVisualStyle;
};

export type AnnotationVisualSelectionStyleOverrides = {
  edge: Partial<EdgeVisualStyle>;
  point: Partial<PointMarkerVisualStyle>;
};

const annotationVisualColorDefaults = Object.freeze({
  previewAlpha: 0.9,
  surfaceAlpha: 0.92,
});

export const annotationVisualDefaults: AnnotationVisualDefaults = {
  colors: {
    neutral: getAnnotationSurfaceStrokeCssColor(1),
    accent: getAnnotationSurfaceStrokeCssColor(1),
    preview: getAnnotationSurfaceStrokeCssColor(
      annotationVisualColorDefaults.previewAlpha
    ),
    surface: resolveDisplayP3WhiteCssColor(
      annotationVisualColorDefaults.surfaceAlpha
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
    edgeStrokeWidth: ANNOTATION_LINE_STYLE_DEFAULTS.strokeWidthPx,
    pointPixelSize: 10,
    pointOutlineWidth: 1,
  },
  patterns: {
    edgeDashPattern: ANNOTATION_LINE_STYLE_DEFAULTS.overlayDashPattern,
  },
};

export const annotationVisualStyles: AnnotationVisualStyles = Object.freeze({
  edge: Object.freeze({
    stroke: annotationVisualDefaults.colors.accent,
    strokeWidth: annotationVisualDefaults.sizes.edgeStrokeWidth,
    overlayDashPattern: annotationVisualDefaults.patterns.edgeDashPattern,
  } satisfies EdgeVisualStyle),
  point: Object.freeze({
    pixelSize: annotationVisualDefaults.sizes.pointPixelSize,
    fill: annotationVisualDefaults.colors.transparent,
    outline: annotationVisualDefaults.colors.surface,
    outlineWidth: annotationVisualDefaults.sizes.pointOutlineWidth,
  } satisfies PointMarkerVisualStyle),
});

export const annotationVisualSelectionStyleOverrides: AnnotationVisualSelectionStyleOverrides =
  Object.freeze({
    edge: Object.freeze({
      stroke: annotationVisualDefaults.colors.neutral,
    } satisfies Partial<EdgeVisualStyle>),
    point: Object.freeze({
      outline: annotationVisualDefaults.colors.neutral,
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
  withEdgeVisualStyle(base, annotationVisualSelectionStyleOverrides.edge);

export const applySelectedPointMarkerVisualStyle = (
  base: PointMarkerVisualStyle
): PointMarkerVisualStyle =>
  withPointMarkerVisualStyle(
    base,
    annotationVisualSelectionStyleOverrides.point
  );
