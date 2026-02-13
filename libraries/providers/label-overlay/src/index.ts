export { LabelOverlayProvider } from "./lib/LabelOverlayProvider";
export { useLabelOverlay } from "./lib/useLabelOverlay";
export type { LabelOverlayElement, LabelOverlayContextType } from "./lib/types";

export { LabelOverlayContainer } from "./lib/components/LabelOverlayContainer";
export {
  PointLabel,
  type PointLabelAttach,
  type PointLabelStyleProps,
} from "./lib/components/PointLabel";
export {
  LineVisualizer,
  type LineVisualizerProps,
} from "./lib/components/LineVisualizer";
export { usePointLabels, type PointLabelData } from "./lib/usePointLabels";
export {
  useLineVisualizers,
  type LineVisualizerData,
  type ScreenPoint,
} from "./lib/useLineVisualizers";
export * from "./lib/pointLabelLayout";

// Formatters for label text
export {
  formatNumberToEnclosed,
  formatDistance,
  createPointLabelText,
} from "./lib/utils/formatters";
