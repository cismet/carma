import type {
  AnnotationDraftStoreState,
  RuntimeCoordinate,
  RuntimeLinkedNodeGroupId,
} from "./annotationsStore.types";
import type { RuntimeToolId } from "../types/runtimeTool.types";

const EMPTY_DRAFT_COORDINATES: readonly RuntimeCoordinate[] = [];
const EMPTY_DRAFT_LINKED_NODE_GROUP_IDS: readonly (
  RuntimeLinkedNodeGroupId | null
)[] = [];

export const getDraftCoordinatesForTool = (
  draftState: AnnotationDraftStoreState,
  toolType: RuntimeToolId
): readonly RuntimeCoordinate[] =>
  draftState.draftCoordinatesByToolType[toolType] ?? EMPTY_DRAFT_COORDINATES;

export const getDraftLinkedNodeGroupIdsForTool = (
  draftState: AnnotationDraftStoreState,
  toolType: RuntimeToolId
): readonly (RuntimeLinkedNodeGroupId | null)[] =>
  draftState.draftLinkedNodeGroupIdsByToolType[toolType] ??
  EMPTY_DRAFT_LINKED_NODE_GROUP_IDS;

export const getPendingAnnotationIdForTool = (
  draftState: AnnotationDraftStoreState,
  toolType: RuntimeToolId
): string | null => draftState.pendingAnnotationIdByToolType[toolType] ?? null;
