import type { ReactNode } from "react";

export interface LabelOverlayElement {
  id: string;
  getCanvasPosition?: () => { x: number; y: number } | null;
  content: ReactNode;
  visible?: boolean;
  isHidden?: boolean;
}

export interface LabelOverlayContextType {
  addLabelOverlayElement: (element: LabelOverlayElement) => void;
  removeLabelOverlayElement: (id: string) => void;
  updateLabelOverlayElement: (
    id: string,
    updates: Partial<LabelOverlayElement>
  ) => void;
  clearLabelOverlayElements: () => void;
}
