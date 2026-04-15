import type { RuntimeCoordinate, RuntimeNodeLinkId } from "../../store";
import type { RuntimeToolId } from "../../types/runtime-tool.types";
import type {
  AnnotationToolDraftState,
  AnnotationToolDraftStore,
} from "../../tools/annotation-tool-plugin.types";
import { areRuntimeCoordinateListsEqual } from "../../utils/runtime-coordinate-equality";

const EMPTY_DRAFT_COORDINATES: readonly RuntimeCoordinate[] = [];
const EMPTY_DRAFT_NODE_LINK_IDS: readonly (RuntimeNodeLinkId | null)[] = [];
const EMPTY_ANNOTATION_TOOL_DRAFT_STATE: AnnotationToolDraftState = {
  coordinates: EMPTY_DRAFT_COORDINATES,
  linkedNodeGroupIds: EMPTY_DRAFT_NODE_LINK_IDS,
};

const areNodeLinkIdsEqual = (
  left: readonly (RuntimeNodeLinkId | null)[],
  right: readonly (RuntimeNodeLinkId | null)[]
) =>
  left.length === right.length &&
  left.every((nodeLinkId, index) => nodeLinkId === right[index]);

const areAnnotationToolDraftStatesEqual = (
  left: AnnotationToolDraftState,
  right: AnnotationToolDraftState
) =>
  areRuntimeCoordinateListsEqual(left.coordinates, right.coordinates) &&
  areNodeLinkIdsEqual(left.linkedNodeGroupIds, right.linkedNodeGroupIds);

export const createAnnotationToolDraftStore = (): AnnotationToolDraftStore => {
  const draftByToolType = new Map<RuntimeToolId, AnnotationToolDraftState>();
  const listenersByToolType = new Map<RuntimeToolId, Set<() => void>>();

  const notifyListeners = (toolType: RuntimeToolId) => {
    listenersByToolType.get(toolType)?.forEach((listener) => listener());
  };

  const getDraft = (toolType: RuntimeToolId): AnnotationToolDraftState =>
    draftByToolType.get(toolType) ?? EMPTY_ANNOTATION_TOOL_DRAFT_STATE;

  return {
    get: getDraft,
    set: (toolType, draft) => {
      const nextDraft: AnnotationToolDraftState = {
        coordinates: [...draft.coordinates],
        linkedNodeGroupIds: [...draft.linkedNodeGroupIds],
      };
      const previousDraft = getDraft(toolType);

      if (areAnnotationToolDraftStatesEqual(previousDraft, nextDraft)) {
        return;
      }

      const hasContent =
        nextDraft.coordinates.length > 0 ||
        nextDraft.linkedNodeGroupIds.length > 0;

      if (!hasContent) {
        draftByToolType.delete(toolType);
      } else {
        draftByToolType.set(toolType, nextDraft);
      }

      notifyListeners(toolType);
    },
    clear: (toolType) => {
      if (!draftByToolType.has(toolType)) {
        return;
      }

      draftByToolType.delete(toolType);
      notifyListeners(toolType);
    },
    subscribe: (toolType, listener) => {
      const listeners = listenersByToolType.get(toolType) ?? new Set();
      listeners.add(listener);
      listenersByToolType.set(toolType, listeners);

      return () => {
        const currentListeners = listenersByToolType.get(toolType);
        if (!currentListeners) {
          return;
        }

        currentListeners.delete(listener);
        if (currentListeners.size === 0) {
          listenersByToolType.delete(toolType);
        }
      };
    },
  };
};
