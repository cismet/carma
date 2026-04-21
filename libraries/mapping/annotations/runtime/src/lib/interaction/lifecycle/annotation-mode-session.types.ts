import type { AnnotationToolType } from "@carma-mapping/annotations/core";
import type { CesiumGeographicCoordinate, AnnotationNodeLinkId } from "../../store";
export type AnnotationModeSession = {
  toolType: AnnotationToolType;
  requestStart: () => void;
  requestFinish: () => boolean;
  discardDraft: () => void;
  onNodeCreated?: (
    coordinate: CesiumGeographicCoordinate,
    linkedNodeGroupId?: AnnotationNodeLinkId | null
  ) => void;
  finishesOnLoopClosure?: boolean;
};

export type AnnotationModeSessionMap = Partial<
  Record<AnnotationToolType, AnnotationModeSession>
>;
