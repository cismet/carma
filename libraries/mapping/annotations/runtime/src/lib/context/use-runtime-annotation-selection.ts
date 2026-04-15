import { useCallback } from "react";

import {
  setSelectedAnnotationId,
  setSelectedAnnotationIds,
  type AnnotationsStore,
} from "../store";

type UseRuntimeAnnotationSelectionOptions = {
  annotationsStore: AnnotationsStore;
  isSelectionAdditiveModifierPressed: boolean;
};

export const useRuntimeAnnotationSelection = ({
  annotationsStore,
  isSelectionAdditiveModifierPressed,
}: UseRuntimeAnnotationSelectionOptions) =>
  useCallback(
    (annotationId: string | null) => {
      if (!annotationId) {
        annotationsStore.dispatch(setSelectedAnnotationId(null));
        return;
      }

      if (!isSelectionAdditiveModifierPressed) {
        annotationsStore.dispatch(setSelectedAnnotationId(annotationId));
        return;
      }

      const currentlySelectedAnnotationIds =
        annotationsStore.getState().selectionState.selectedAnnotationIds;
      const nextSelectedAnnotationIds = currentlySelectedAnnotationIds.includes(
        annotationId
      )
        ? currentlySelectedAnnotationIds.filter(
            (selectedAnnotationId) => selectedAnnotationId !== annotationId
          )
        : [...currentlySelectedAnnotationIds, annotationId];

      annotationsStore.dispatch(
        setSelectedAnnotationIds(nextSelectedAnnotationIds)
      );
    },
    [annotationsStore, isSelectionAdditiveModifierPressed]
  );
