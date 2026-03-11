import type { Scene } from "@carma/cesium";

import { useFocusedNodeChainAnnotationId } from "./useFocusedNodeChainAnnotationId";
import {
  useAnnotationSelection,
  type AnnotationSelectionController,
} from "./useAnnotationSelection";
import type { AnnotationsStore } from "../store";

export type AnnotationsSelectionState = AnnotationSelectionController & {
  focusedNodeChainAnnotationId: string | null;
};

export const useAnnotationsSelectionState = (
  annotationsStore: AnnotationsStore,
  scene: Scene | null,
  selectableAnnotationIds: ReadonlySet<string>,
  getOwnerGroupIdsForPointId: (pointId: string) => readonly string[],
  activeNodeChainAnnotationId: string | null
): AnnotationsSelectionState => {
  const annotationSelection = useAnnotationSelection(
    annotationsStore,
    scene,
    selectableAnnotationIds
  );
  const focusedNodeChainAnnotationId = useFocusedNodeChainAnnotationId(
    annotationSelection.selectedAnnotationId,
    annotationSelection.selectedAnnotationIds,
    getOwnerGroupIdsForPointId,
    activeNodeChainAnnotationId
  );

  return {
    ...annotationSelection,
    focusedNodeChainAnnotationId,
  };
};
