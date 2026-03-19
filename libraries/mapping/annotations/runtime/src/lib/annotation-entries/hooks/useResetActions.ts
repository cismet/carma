import { useCallback, type Dispatch, type SetStateAction } from "react";

import {
  ANNOTATION_TYPE_DISTANCE,
  type AnnotationCollection,
  type AnnotationMode,
  type NodeChainAnnotation,
  type PointDistanceRelation,
} from "@carma-mapping/annotations/core";

type UseResetActionsParams = {
  hideAnnotationsOfType: ReadonlySet<AnnotationMode>;
  setHideAnnotationsOfType: Dispatch<SetStateAction<Set<AnnotationMode>>>;
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
  setDistanceRelations: Dispatch<SetStateAction<PointDistanceRelation[]>>;
  setNodeChainAnnotations: Dispatch<SetStateAction<NodeChainAnnotation[]>>;
  clearAnnotationSelection: () => void;
  clearNodeSelection: () => void;
  clearActiveNodeChainDrawingState: () => void;
  clearMoveGizmo: () => void;
};

export const useResetActions = ({
  hideAnnotationsOfType,
  setHideAnnotationsOfType,
  setAnnotations,
  setDistanceRelations,
  setNodeChainAnnotations,
  clearAnnotationSelection,
  clearNodeSelection,
  clearActiveNodeChainDrawingState,
  clearMoveGizmo,
}: UseResetActionsParams) => {
  const clearAllAnnotations = useCallback(() => {
    setAnnotations([]);
    setDistanceRelations([]);
    setNodeChainAnnotations([]);
    clearAnnotationSelection();
    clearActiveNodeChainDrawingState();
    clearMoveGizmo();
    if (hideAnnotationsOfType.size > 0) {
      setHideAnnotationsOfType(new Set());
    }
  }, [
    clearActiveNodeChainDrawingState,
    clearAnnotationSelection,
    clearMoveGizmo,
    hideAnnotationsOfType.size,
    setAnnotations,
    setDistanceRelations,
    setHideAnnotationsOfType,
    setNodeChainAnnotations,
  ]);

  const clearAnnotationsByType = useCallback(
    (type: AnnotationMode) => {
      setAnnotations((prev) =>
        prev.filter((annotation) => annotation.type !== type)
      );
      if (type === ANNOTATION_TYPE_DISTANCE) {
        setDistanceRelations([]);
        setNodeChainAnnotations([]);
        clearActiveNodeChainDrawingState();
      }
      clearNodeSelection();
      clearMoveGizmo();
      setHideAnnotationsOfType((prev) => {
        if (!prev.has(type)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(type);
        return next;
      });
    },
    [
      clearActiveNodeChainDrawingState,
      clearMoveGizmo,
      clearNodeSelection,
      setAnnotations,
      setDistanceRelations,
      setHideAnnotationsOfType,
      setNodeChainAnnotations,
    ]
  );

  return {
    clearAllAnnotations,
    clearAnnotationsByType,
  };
};
