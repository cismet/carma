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
export { usePointLabels, type PointLabelData } from "./lib/usePointLabels";
export {
  useLineVisualizers,
  type LineVisualizerData,
} from "./lib/useLineVisualizers";
export * from "./lib/pointLabelLayout";
