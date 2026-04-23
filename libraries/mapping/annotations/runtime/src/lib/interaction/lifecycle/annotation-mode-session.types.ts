import type {
  CesiumGeographicCoordinate,
  AnnotationNodeLinkId,
} from "../../store";
import type { AnnotationToolId } from "../../registry/annotation-tool-id";
export type AnnotationModeSession = {
  toolType: AnnotationToolId;
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
  Record<AnnotationToolId, AnnotationModeSession>
>;
