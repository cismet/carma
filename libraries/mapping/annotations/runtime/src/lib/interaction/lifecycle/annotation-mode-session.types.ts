import type { RuntimeCoordinate, RuntimeNodeLinkId } from "../../store";
import type { RuntimeToolId } from "../../types/runtime-tool.types";
export type AnnotationModeSession = {
  toolType: RuntimeToolId;
  requestStart: () => void;
  requestFinish: () => boolean;
  discardDraft: () => void;
  onNodeCreated?: (
    coordinate: RuntimeCoordinate,
    linkedNodeGroupId?: RuntimeNodeLinkId | null
  ) => void;
  finishesOnLoopClosure?: boolean;
};

export type AnnotationModeSessionMap = Partial<
  Record<RuntimeToolId, AnnotationModeSession>
>;
