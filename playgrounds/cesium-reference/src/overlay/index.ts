// Main exports for the overlay system
export { OverlayProvider, useOverlay } from "./contexts/OverlayContext";
export type { OverlayElement, OverlayContextType } from "./types/OverlayTypes";

// Built-in components and hooks
export { PointLabel } from "./components/PointLabel";
export { usePointLabels } from "./hooks/usePointLabels";
export type { PointLabelData } from "./hooks/usePointLabels";
