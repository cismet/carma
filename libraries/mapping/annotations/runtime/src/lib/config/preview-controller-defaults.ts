import { measurementVisualDefaults } from "./measurement-visual-defaults";

export const previewControllerDefaults = Object.freeze({
  lineStrokeWidthPx: measurementVisualDefaults.sizes.edgeStrokeWidth,
  layerZIndex: "1550",
  lineLabelOffsetPx: 8,
  lineLabelMinLengthPx: 44,
  geometryEpsilonMeters: 0.01,
  labelReferenceLineLengthEpsilonPx: 1e-3,
  labelReferenceDistanceFactor: 0.2,
  labelReferenceMinDistancePx: 24,
  labelReferenceMaxDistancePx: 48,
  labelReferenceInsideBlendFactor: 0.35,
  labelSideSwitchThresholdPx: 4,
  directLineColor: measurementVisualDefaults.colors.components.direct,
  verticalLineColor: measurementVisualDefaults.colors.components.vertical,
  horizontalLineColor: measurementVisualDefaults.colors.components.horizontal,
  draftChainColor: measurementVisualDefaults.colors.preview,
});

export type PreviewControllerOptions = typeof previewControllerDefaults;
