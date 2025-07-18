import { ReactNode } from "react";
import { Cartesian3 } from "cesium";

export interface OverlayElement {
  id: string;
  getCanvasPosition?: () => { x: number; y: number } | null; // Callback to get fresh screen coordinates
  getLocalUpVector?: () => { x: number; y: number } | null; // Local up vector in screen space
  content: ReactNode;
  visible?: boolean;
  isHidden?: boolean; // Hidden (outside viewport) - don't update DOM position
  renderCustom?: (
    ctx: CanvasRenderingContext2D,
    anchorPos: { x: number; y: number },
    upVector?: { x: number; y: number }
  ) => void; // Custom canvas rendering
}

export interface CesiumOverlayContextType {
  addOverlayElement: (element: OverlayElement) => void;
  removeOverlayElement: (id: string) => void;
  updateOverlayElement: (id: string, updates: Partial<OverlayElement>) => void;
  clearOverlayElements: () => void;
}
