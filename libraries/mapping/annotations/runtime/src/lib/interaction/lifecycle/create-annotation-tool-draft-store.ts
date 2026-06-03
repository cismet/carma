import type {
  CesiumGeographicCoordinate,
  AnnotationNodeLinkId,
} from "../../store";
import type {
  AnnotationToolDraftState,
  AnnotationToolDraftStore,
} from "../../registry";
import type { AnnotationToolId } from "@carma-mapping/annotations/core";
import { areCoordinateListsEqual } from "../../utils/coordinate-equality";

const EMPTY_DRAFT_COORDINATES: readonly CesiumGeographicCoordinate[] = [];
const EMPTY_DRAFT_NODE_LINK_IDS: readonly (AnnotationNodeLinkId | null)[] = [];
const EMPTY_ANNOTATION_TOOL_DRAFT_STATE: AnnotationToolDraftState = {
  coordinates: EMPTY_DRAFT_COORDINATES,
  linkedNodeGroupIds: EMPTY_DRAFT_NODE_LINK_IDS,
  feedback: null,
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
  areNodeLinkIdsEqual(left.linkedNodeGroupIds, right.linkedNodeGroupIds) &&
  left.feedback?.kind === right.feedback?.kind &&
  left.feedback?.message === right.feedback?.message;

export const createAnnotationToolDraftStore = (): AnnotationToolDraftStore => {
  const draftByToolType = new Map<AnnotationToolId, AnnotationToolDraftState>();
  const listenersByToolType = new Map<AnnotationToolId, Set<() => void>>();

  const notifyListeners = (toolType: AnnotationToolId) => {
    listenersByToolType.get(toolType)?.forEach((listener) => listener());
  };

  const getDraft = (toolType: AnnotationToolId): AnnotationToolDraftState =>
    draftByToolType.get(toolType) ?? EMPTY_ANNOTATION_TOOL_DRAFT_STATE;

  return {
    get: getDraft,
    set: (toolType, draft) => {
      const nextDraft: AnnotationToolDraftState = {
        coordinates: [...draft.coordinates],
        linkedNodeGroupIds: [...draft.linkedNodeGroupIds],
        feedback: draft.feedback ?? null,
      };
      const previousDraft = getDraft(toolType);

      if (areAnnotationToolDraftStatesEqual(previousDraft, nextDraft)) {
        return;
      }

      const hasContent =
        nextDraft.coordinates.length > 0 ||
        nextDraft.linkedNodeGroupIds.length > 0 ||
        Boolean(nextDraft.feedback);

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
