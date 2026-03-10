import type { ReactNode } from "react";
import type { CssPixelPosition } from "@carma/units/types";
import type { CSSProperties } from "react";

export interface LabelOverlayElement {
  id: string;
  getCanvasPosition?: () => CssPixelPosition | null;
  updatePosition?: (elementDiv: HTMLElement) => boolean;
  content: ReactNode;
  contentKey?: string;
  zIndex?: number;
  visible?: boolean;
  isHidden?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  cursor?: CSSProperties["cursor"];
}

export interface LabelOverlayContextType {
  addLabelOverlayElement: (element: LabelOverlayElement) => void;
  removeLabelOverlayElement: (id: string) => void;
  updateLabelOverlayElement: (
    id: string,
    updates: Partial<LabelOverlayElement>
  ) => void;
  clearLabelOverlayElements: () => void;
  updatePositions: () => void;
}
