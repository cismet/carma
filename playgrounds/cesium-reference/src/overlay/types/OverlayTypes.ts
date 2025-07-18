import { ReactNode } from "react";
import { Cartesian3 } from "cesium";

export interface OverlayElement {
  id: string;
  position: Cartesian3;
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