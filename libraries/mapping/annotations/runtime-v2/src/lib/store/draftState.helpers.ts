import type {
  AnnotationDraftStoreState,
  RuntimeCoordinate,
} from "./annotationsStore.types";
import type { RuntimeToolId } from "../types/runtimeTool.types";

const EMPTY_DRAFT_COORDINATES: readonly RuntimeCoordinate[] = [];

export const getDraftCoordinatesForTool = (
  draftState: AnnotationDraftStoreState,
  toolType: RuntimeToolId
): readonly RuntimeCoordinate[] =>
  draftState.draftCoordinatesByToolType[toolType] ?? EMPTY_DRAFT_COORDINATES;

export const getPendingAnnotationIdForTool = (
  draftState: AnnotationDraftStoreState,
  toolType: RuntimeToolId
): string | null => draftState.pendingAnnotationIdByToolType[toolType] ?? null;
