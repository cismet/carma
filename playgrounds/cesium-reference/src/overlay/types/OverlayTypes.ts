import { ReactNode } from "react";
import { Cartesian3 } from "cesium";

export interface OverlayElement {
  id: string;
  getCanvasPosition?: () => { x: number; y: number } | null; // Callback to get fresh screen coordinates
  getCameraPitch?: () => number; // Camera pitch in radians
  content: ReactNode;
  visible?: boolean;
  isHidden?: boolean; // Hidden (outside viewport) - don't update DOM position
}

export interface CesiumOverlayContextType {
  addOverlayElement: (element: OverlayElement) => void;
  removeOverlayElement: (id: string) => void;
  updateOverlayElement: (id: string, updates: Partial<OverlayElement>) => void;
  clearOverlayElements: () => void;
}
