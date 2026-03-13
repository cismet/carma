import type { RuntimeCoordinate } from "../../store";
import type { RuntimeToolId } from "../../types/runtimeTool.types";

export type AnnotationModeSession = {
  toolType: RuntimeToolId;
  requestStart: () => void;
  requestFinish: () => boolean;
  discardDraft: () => void;
  onNodeCreated?: (coordinate: RuntimeCoordinate) => void;
  finishesOnLoopClosure?: boolean;
};

export type AnnotationModeSessionMap = Partial<
  Record<RuntimeToolId, AnnotationModeSession>
>;
