export { LabelOverlayProvider } from "./lib/LabelOverlayProvider";
export { useLabelOverlay } from "./lib/useLabelOverlay";
export type { LabelOverlayElement, LabelOverlayContextType } from "./lib/types";

export { LabelOverlayContainer } from "./lib/components/LabelOverlayContainer";
export {
  PointLabel,
  POINT_LABEL_TEXT_BACKGROUND_COLOR,
  POINT_LABEL_HOVER_BACKGROUND_COLOR,
  POINT_LABEL_SELECTED_BACKGROUND_COLOR,
  type PointLabelAttach,
  type PointLabelStyleProps,
} from "./lib/components/PointLabel";
export {
  PointLabelMarker,
  getPillbuttonAnchorBorderStyle,
  getPillbuttonAnchorTransform,
  resolvePillbuttonMountSide,
  type PillbuttonMountSide,
} from "./lib/components/PointLabelMarker";
export { PillbuttonLabelMarker } from "./lib/components/PillbuttonLabelMarker";
export {
  PointLabelStem,
  type PointLabelStemAnchorPoints,
} from "./lib/components/PointLabelStem";
export {
  LineVisualizer,
  type LineVisualizerProps,
} from "./lib/components/LineVisualizer";
export {
  AnchoredLabelVisualizer,
  type AnchoredLabelVisualizerProps,
} from "./lib/components/AnchoredLabelVisualizer";
export { usePointLabels, type PointLabelData } from "./lib/usePointLabels";
export {
  useLineVisualizers,
  type LineVisualizerData,
} from "./lib/useLineVisualizers";
export {
  createSvgLineVisualizers,
  createScreenPointSvgLineVisualizers,
  createSvgLineVisualizer,
  createScreenPointSvgLineVisualizer,
  getScreenPointDistance,
  type SvgLineCapStyle,
  type CreateSvgLineVisualizersOptions,
  type CreateScreenPointSvgLineVisualizersOptions,
  type CreateSvgLineVisualizerOptions,
  type CreateScreenPointSvgLineVisualizerOptions,
} from "./lib/utils/lineVisualizerGenerator";
export {
  computePolygonScreenWindingOrder,
  computePolygonSegmentLabelPlacements,
  type PolygonSegmentLabelSide,
  type PolygonSegmentLabelRotationMode,
  type PolygonSegmentLabelWindingOrder,
  type PolygonSegmentLabelWindingPolicy,
  type PolygonSegmentLabelPlacement,
  type ComputePolygonSegmentLabelPlacementsOptions,
} from "./lib/utils/polygonSegmentLabeler";
export * from "./lib/pointLabelLayout";
