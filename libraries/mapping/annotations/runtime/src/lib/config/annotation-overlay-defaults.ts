import { annotationVisualDefaults } from "./annotation-visual-defaults";

export const annotationOverlayDefaults = Object.freeze({
  lineStrokeWidthPx: annotationVisualDefaults.sizes.edgeStrokeWidth,
  layerZIndex: "1550",
  lineLabelOffsetPx: 9,
  lineLabelMinLengthPx: 44,
  geometryEpsilonMeters: 0.01,
  directLineColor: annotationVisualDefaults.colors.components.direct,
  verticalLineColor: annotationVisualDefaults.colors.components.vertical,
  horizontalLineColor: annotationVisualDefaults.colors.components.horizontal,
  draftChainColor: annotationVisualDefaults.colors.preview,
});

export type AnnotationOverlayDefaults = typeof annotationOverlayDefaults;
