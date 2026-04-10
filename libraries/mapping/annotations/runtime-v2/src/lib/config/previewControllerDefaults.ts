import { runtimeMeasurementVisualDefaults } from "./measurementVisualDefaults";

export const previewControllerDefaults = Object.freeze({
  lineStrokeWidthPx: 1,
  layerZIndex: "1550",
  lineLabelOffsetPx: 8,
  lineLabelMinLengthPx: 44,
  geometryEpsilonMeters: 0.01,
  labelReferenceMinDistancePx: 24,
  labelReferenceMaxDistancePx: 48,
  labelReferenceInsideBlendFactor: 0.35,
  labelSideSwitchThresholdPx: 4,
  directLineColor: runtimeMeasurementVisualDefaults.colors.components.direct,
  verticalLineColor:
    runtimeMeasurementVisualDefaults.colors.components.vertical,
  horizontalLineColor:
    runtimeMeasurementVisualDefaults.colors.components.horizontal,
  draftChainColor: runtimeMeasurementVisualDefaults.colors.preview,
});

export type PreviewControllerOptions = typeof previewControllerDefaults;
