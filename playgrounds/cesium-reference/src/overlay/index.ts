// Main exports for the overlay system
export { CesiumOverlayProvider, useCesiumOverlay } from "./contexts/CesiumOverlayContext";
export type { OverlayElement, CesiumOverlayContextType } from "./types/OverlayTypes";

// Built-in components and hooks
export { PointLabel } from "./components/PointLabel";
export { usePointLabels } from "./hooks/usePointLabels";
export type { PointLabelData } from "./hooks/usePointLabels";