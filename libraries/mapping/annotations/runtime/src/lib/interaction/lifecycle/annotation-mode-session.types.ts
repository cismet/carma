import type {
  AnnotationGeographicCoordinate,
  AnnotationNodeLinkId,
} from "../../store";
import type {
  AnnotationToolId,
  AnnotationEnginePointQueryInputModifier,
} from "@carma-mapping/annotations/core";
export type AnnotationModeSession = {
  toolType: AnnotationToolId;
  requestStart: () => void;
  requestFinish: () => boolean;
  discardDraft: () => void;
  onNodeCreated?: (
    coordinate: AnnotationGeographicCoordinate,
    linkedNodeGroupId?: AnnotationNodeLinkId | null,
    options?: { inputModifier?: AnnotationEnginePointQueryInputModifier }
  ) => void;
  finishesOnLoopClosure?: boolean;
};

export type AnnotationModeSessionMap = Partial<
  Record<AnnotationToolId, AnnotationModeSession>
>;
