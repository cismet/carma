import type { CSSProperties } from "react";
import type { ReactNode } from "react";

export interface LabelOverlayElement {
  id: string;
  updatePosition?: (elementDiv: HTMLElement) => boolean;
  content: ReactNode;
  contentKey?: string;
  zIndex?: number;
  visible?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  cursor?: CSSProperties["cursor"];
}

export interface LabelOverlayContextType {
  setLabelOverlayElement: (element: LabelOverlayElement) => void;
  removeLabelOverlayElement: (id: string) => void;
  updatePositions: () => void;
  invalidatePositions: () => void;
}
