import { useCallback, type Dispatch, type SetStateAction } from "react";

import type {
  AnnotationCollection,
  NodeChainAnnotation,
  PointDistanceRelation,
} from "@carma-mapping/annotations/core";

import type { AnnotationsStore } from "../../store";
import type { DistanceSessionState } from "../../store";
type UseAnnotationDraftActionsParams = {
  annotationsStore: AnnotationsStore;
  moveGizmoPointId: string | null;
  distanceSession: DistanceSessionState;
  setActiveNodeChainAnnotationId: Dispatch<SetStateAction<string | null>>;
  setLabelInputPromptPointId: Dispatch<SetStateAction<string | null>>;
  setNodeChainAnnotations: Dispatch<SetStateAction<NodeChainAnnotation[]>>;
  setDistanceRelations: Dispatch<SetStateAction<PointDistanceRelation[]>>;
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
  pruneSelectionByRemovedIds: (removedIds: ReadonlySet<string>) => void;
  clearMeasurementDraftSession: () => void;
  clearDistanceSession: () => void;
  clearAnnotationCursor: () => void;
  clearAnnotationSelection: () => void;
  clearMoveGizmo: () => void;
};

export const useDraftActions = ({
  annotationsStore,
  moveGizmoPointId,
  distanceSession,
  setActiveNodeChainAnnotationId,
  setLabelInputPromptPointId,
  setNodeChainAnnotations,
  setDistanceRelations,
  setAnnotations,
  pruneSelectionByRemovedIds,
  clearMeasurementDraftSession,
  clearDistanceSession,
  clearAnnotationCursor,
  clearAnnotationSelection,
  clearMoveGizmo,
}: UseAnnotationDraftActionsParams) => {
  const clearActiveNodeChainAnnotation = useCallback(() => {
    setActiveNodeChainAnnotationId((previousId) =>
      previousId === null ? previousId : null
    );
  }, [setActiveNodeChainAnnotationId]);

  const clearPendingLabelPlacementAnnotation = useCallback(() => {
    setLabelInputPromptPointId((previousId) =>
      previousId === null ? previousId : null
    );
  }, [setLabelInputPromptPointId]);

  const clearActiveNodeChainDrawingState = useCallback(() => {
    clearActiveNodeChainAnnotation();
    clearMeasurementDraftSession();
  }, [clearActiveNodeChainAnnotation, clearMeasurementDraftSession]);

  const discardActiveMeasurementDraft = useCallback(
    (activeGroupId: string | null) => {
      const { createdPointIds, createdRelationIds } =
        annotationsStore.getState();
      const draftPointIds =
        activeGroupId === null
          ? distanceSession.createdPointIds
          : createdPointIds;
      const draftRelationIds =
        activeGroupId === null
          ? distanceSession.createdRelationIds
          : createdRelationIds;
      const createdPointIdSet = new Set(draftPointIds);
      const createdRelationIdSet = new Set(draftRelationIds);

      if (activeGroupId) {
        setNodeChainAnnotations((previousGroups) =>
          previousGroups.filter((group) => group.id !== activeGroupId)
        );
      }

      if (createdRelationIdSet.size > 0) {
        setDistanceRelations((previousRelations) =>
          previousRelations.filter(
            (relation) => !createdRelationIdSet.has(relation.id)
          )
        );
      }

      if (createdPointIdSet.size > 0) {
        setAnnotations((previousAnnotations) =>
          previousAnnotations.filter(
            (annotation) => !createdPointIdSet.has(annotation.id)
          )
        );
        pruneSelectionByRemovedIds(createdPointIdSet);

        if (moveGizmoPointId && createdPointIdSet.has(moveGizmoPointId)) {
          clearMoveGizmo();
        }

        setLabelInputPromptPointId((previousPromptPointId) =>
          previousPromptPointId && createdPointIdSet.has(previousPromptPointId)
            ? null
            : previousPromptPointId
        );
      }

      clearAnnotationCursor();
      clearAnnotationSelection();
      clearActiveNodeChainDrawingState();
      clearDistanceSession();
      clearMoveGizmo();
      setLabelInputPromptPointId(null);
    },
    [
      annotationsStore,
      clearActiveNodeChainDrawingState,
      clearDistanceSession,
      clearAnnotationCursor,
      clearAnnotationSelection,
      clearMoveGizmo,
      distanceSession.createdPointIds,
      distanceSession.createdRelationIds,
      moveGizmoPointId,
      pruneSelectionByRemovedIds,
      setAnnotations,
      setDistanceRelations,
      setLabelInputPromptPointId,
      setNodeChainAnnotations,
    ]
  );

  return {
    clearActiveNodeChainAnnotation,
    clearPendingLabelPlacementAnnotation,
    clearActiveNodeChainDrawingState,
    discardActiveMeasurementDraft,
  };
};
