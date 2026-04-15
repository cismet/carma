import type { AnnotationDraftStoreState } from "./annotations-store.types";
import type { RuntimeToolId } from "../types/runtime-tool.types";

export const getPendingAnnotationIdForTool = (
  draftState: AnnotationDraftStoreState,
  toolType: RuntimeToolId
): string | null => draftState.pendingAnnotationIdByToolType[toolType] ?? null;
