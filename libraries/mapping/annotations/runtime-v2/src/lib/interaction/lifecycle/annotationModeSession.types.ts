import type { RuntimeCoordinate, RuntimeLinkedNodeGroupId } from "../../store";
import type { RuntimeToolId } from "../../types/runtimeTool.types";
export type AnnotationModeSession = {
  toolType: RuntimeToolId;
  requestStart: () => void;
  requestFinish: () => boolean;
  discardDraft: () => void;
  onNodeCreated?: (
    coordinate: RuntimeCoordinate,
    linkedNodeGroupId?: RuntimeLinkedNodeGroupId | null
  ) => void;
  finishesOnLoopClosure?: boolean;
};

export type AnnotationModeSessionMap = Partial<
  Record<RuntimeToolId, AnnotationModeSession>
>;
