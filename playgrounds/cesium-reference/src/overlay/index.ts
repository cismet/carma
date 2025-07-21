// Main exports for the overlay system
export { OverlayProvider, useOverlay } from "./contexts/OverlayContext";
export type { OverlayElement, OverlayContextType } from "./types/OverlayTypes";

// Built-in components and hooks
export { PointLabel, MarkerStyle } from "./components/PointLabel";
export { ConnectingLine } from "./components/ConnectingLine";
export type { ConnectingLineProps } from "./components/ConnectingLine";
export { usePointLabels } from "./hooks/usePointLabels";
export type { PointLabelData } from "./hooks/usePointLabels";

// Utility functions
export {
  calculateLineProperties,
  calculateDistance,
  calculateAngle,
  calculatePointAlongLine,
  calculateMidpoint,
  createLineStyles,
} from "./utils/lineUtils";
export type { Point, LineProperties } from "./utils/lineUtils";
