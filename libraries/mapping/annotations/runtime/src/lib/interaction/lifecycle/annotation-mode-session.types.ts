import type {
  CesiumGeographicCoordinate,
  AnnotationNodeLinkId,
} from "../../store";
import type { AnnotationToolId } from "@carma-mapping/annotations/core";
import type { AnnotationPointQueryInputModifier } from "./point-query-input-modifier";
export type AnnotationModeSession = {
  toolType: AnnotationToolId;
  requestStart: () => void;
  requestFinish: () => boolean;
  discardDraft: () => void;
  onNodeCreated?: (
    coordinate: CesiumGeographicCoordinate,
    linkedNodeGroupId?: AnnotationNodeLinkId | null,
    options?: { inputModifier?: AnnotationPointQueryInputModifier }
  ) => void;
  finishesOnLoopClosure?: boolean;
};

export type AnnotationModeSessionMap = Partial<
  Record<AnnotationToolId, AnnotationModeSession>
>;
