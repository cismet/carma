import { useCallback, type Dispatch, type SetStateAction } from "react";

import type {
  AnnotationCollection,
  NodeChainAnnotation,
  PointDistanceRelation,
} from "@carma-mapping/annotations/core";

type UseAnnotationDraftActionsParams = {
  createdPointIds: readonly string[];
  createdRelationIds: readonly string[];
  moveGizmoPointId: string | null;
  setActiveNodeChainAnnotationId: Dispatch<SetStateAction<string | null>>;
  setDoubleClickChainSourcePointId: Dispatch<SetStateAction<string | null>>;
  setPendingPolylinePromotionRingClosurePointId: Dispatch<
    SetStateAction<string | null>
  >;
  setLabelInputPromptPointId: Dispatch<SetStateAction<string | null>>;
  setNodeChainAnnotations: Dispatch<SetStateAction<NodeChainAnnotation[]>>;
  setDistanceRelations: Dispatch<SetStateAction<PointDistanceRelation[]>>;
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
  pruneSelectionByRemovedIds: (removedIds: ReadonlySet<string>) => void;
  clearMeasurementDraftSession: () => void;
  clearAnnotationCursor: () => void;
  clearAnnotationSelection: () => void;
  clearMoveGizmo: () => void;
};

export const useAnnotationDraftActions = ({
  createdPointIds,
  createdRelationIds,
  moveGizmoPointId,
  setActiveNodeChainAnnotationId,
  setDoubleClickChainSourcePointId,
  setPendingPolylinePromotionRingClosurePointId,
  setLabelInputPromptPointId,
  setNodeChainAnnotations,
  setDistanceRelations,
  setAnnotations,
  pruneSelectionByRemovedIds,
  clearMeasurementDraftSession,
  clearAnnotationCursor,
  clearAnnotationSelection,
  clearMoveGizmo,
}: UseAnnotationDraftActionsParams) => {
  const clearActiveNodeChainAnnotation = useCallback(() => {
    setActiveNodeChainAnnotationId((previousId) =>
      previousId === null ? previousId : null
    );
  }, [setActiveNodeChainAnnotationId]);

  const clearPendingPolylineRingPromotion = useCallback(() => {
    setPendingPolylinePromotionRingClosurePointId((previousId) =>
      previousId === null ? previousId : null
    );
  }, [setPendingPolylinePromotionRingClosurePointId]);

  const clearPendingLabelPlacementAnnotation = useCallback(() => {
    setLabelInputPromptPointId((previousId) =>
      previousId === null ? previousId : null
    );
  }, [setLabelInputPromptPointId]);

  const clearActiveNodeChainDrawingState = useCallback(() => {
    clearActiveNodeChainAnnotation();
    setDoubleClickChainSourcePointId(null);
    clearMeasurementDraftSession();
  }, [
    clearActiveNodeChainAnnotation,
    clearMeasurementDraftSession,
    setDoubleClickChainSourcePointId,
  ]);

  const discardActiveMeasurementDraft = useCallback(
    (activeGroupId: string | null) => {
      const createdPointIdSet = new Set(createdPointIds);
      const createdRelationIdSet = new Set(createdRelationIds);

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
      clearMoveGizmo();
      setPendingPolylinePromotionRingClosurePointId(null);
      setLabelInputPromptPointId(null);
    },
    [
      clearActiveNodeChainDrawingState,
      clearAnnotationCursor,
      clearAnnotationSelection,
      clearMoveGizmo,
      createdPointIds,
      createdRelationIds,
      moveGizmoPointId,
      pruneSelectionByRemovedIds,
      setAnnotations,
      setDistanceRelations,
      setLabelInputPromptPointId,
      setNodeChainAnnotations,
      setPendingPolylinePromotionRingClosurePointId,
    ]
  );

  return {
    clearActiveNodeChainAnnotation,
    clearPendingPolylineRingPromotion,
    clearPendingLabelPlacementAnnotation,
    clearActiveNodeChainDrawingState,
    discardActiveMeasurementDraft,
  };
};
