import { ReactNode } from "react";

export interface OverlayElement {
  id: string;
  getCanvasPosition?: () => { x: number; y: number } | null; // Callback to get fresh screen coordinates
  content: ReactNode;
  visible?: boolean;
  isHidden?: boolean; // Hidden (outside viewport) - don't update DOM position
}

export interface OverlayContextType {
  addOverlayElement: (element: OverlayElement) => void;
  removeOverlayElement: (id: string) => void;
  updateOverlayElement: (id: string, updates: Partial<OverlayElement>) => void;
  clearOverlayElements: () => void;
}
