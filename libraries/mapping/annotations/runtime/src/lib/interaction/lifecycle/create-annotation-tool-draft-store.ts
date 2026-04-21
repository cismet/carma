import type { AnnotationToolType } from "@carma-mapping/annotations/core";
import type { CesiumGeographicCoordinate, AnnotationNodeLinkId } from "../../store";
import type {
  AnnotationToolDraftState,
  AnnotationToolDraftStore,
} from "../../tools/annotation-tool-plugin.types";
import { areCoordinateListsEqual } from "../../utils/coordinate-equality";

const EMPTY_DRAFT_COORDINATES: readonly CesiumGeographicCoordinate[] = [];
const EMPTY_DRAFT_NODE_LINK_IDS: readonly (AnnotationNodeLinkId | null)[] = [];
const EMPTY_ANNOTATION_TOOL_DRAFT_STATE: AnnotationToolDraftState = {
  coordinates: EMPTY_DRAFT_COORDINATES,
  linkedNodeGroupIds: EMPTY_DRAFT_NODE_LINK_IDS,
};

const areNodeLinkIdsEqual = (
  left: readonly (AnnotationNodeLinkId | null)[],
  right: readonly (AnnotationNodeLinkId | null)[]
) =>
  left.length === right.length &&
  left.every((nodeLinkId, index) => nodeLinkId === right[index]);

const areAnnotationToolDraftStatesEqual = (
  left: AnnotationToolDraftState,
  right: AnnotationToolDraftState
) =>
  areCoordinateListsEqual(left.coordinates, right.coordinates) &&
  areNodeLinkIdsEqual(left.linkedNodeGroupIds, right.linkedNodeGroupIds);

export const createAnnotationToolDraftStore = (): AnnotationToolDraftStore => {
  const draftByToolType = new Map<AnnotationToolType, AnnotationToolDraftState>();
  const listenersByToolType = new Map<AnnotationToolType, Set<() => void>>();

  const notifyListeners = (toolType: AnnotationToolType) => {
    listenersByToolType.get(toolType)?.forEach((listener) => listener());
  };

  const getDraft = (toolType: AnnotationToolType): AnnotationToolDraftState =>
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
