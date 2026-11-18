import { useCallback, type Dispatch, type SetStateAction } from "react";

import {
  ANNOTATION_SHORT_LABEL_SOURCES,
  resolveNextElevationDisplayMode,
  setElevationReferenceAnnotationId as setElevationReferenceAnnotationIdAction,
  setPointTemporaryMode as setPointTemporaryModeAction,
  updateAnnotationEntryById,
  type AnnotationsStore,
  type StoredAnnotation,
} from "../store";
import {
  findAnnotationEntryInStore,
  isAnnotationEntryEditable,
} from "./annotation-entry-lookup";

type UseAnnotationEntryActionsOptions = {
  annotationsStore: AnnotationsStore;
  activeEditedNodeId: string | null;
  setActiveEditedNodeId: Dispatch<SetStateAction<string | null>>;
};

/** Store updates of single annotation entries and runtime settings. */
export const useAnnotationEntryActions = ({
  annotationsStore,
  activeEditedNodeId,
  setActiveEditedNodeId,
}: UseAnnotationEntryActionsOptions) => {
  const setElevationReferenceAnnotationIdInStore = useCallback(
    (annotationId: string | null) => {
      annotationsStore.dispatch(
        setElevationReferenceAnnotationIdAction(annotationId)
      );
    },
    [annotationsStore]
  );

  const setPointTemporaryModeInStore = useCallback(
    (temporaryMode: boolean) => {
      annotationsStore.dispatch(setPointTemporaryModeAction(temporaryMode));
    },
    [annotationsStore]
  );

  const toggleAnnotationVisibility = useCallback(
    (annotationId: string) => {
      const targetEntry = findAnnotationEntryInStore(
        annotationsStore,
        annotationId
      );
      if (!targetEntry) {
        return;
      }

      annotationsStore.dispatch(
        updateAnnotationEntryById({
          annotationId,
          hidden: !targetEntry.hidden,
        })
      );
    },
    [annotationsStore]
  );

  const toggleAnnotationLocked = useCallback(
    (annotationId: string) => {
      const targetEntry = findAnnotationEntryInStore(
        annotationsStore,
        annotationId
      );
      if (!targetEntry || targetEntry.readOnly) {
        return;
      }

      const nextLocked = !targetEntry.locked;
      annotationsStore.dispatch(
        updateAnnotationEntryById({ annotationId, locked: nextLocked })
      );

      if (
        nextLocked &&
        targetEntry.nodeIds.includes(activeEditedNodeId ?? "")
      ) {
        setActiveEditedNodeId(null);
      }
    },
    [activeEditedNodeId, annotationsStore, setActiveEditedNodeId]
  );

  const updateAnnotationDisplayName = useCallback(
    (annotationId: string, displayName: string) => {
      if (
        !isAnnotationEntryEditable(
          findAnnotationEntryInStore(annotationsStore, annotationId)
        )
      ) {
        return;
      }

      annotationsStore.dispatch(
        updateAnnotationEntryById({
          annotationId,
          displayName: displayName.trim(),
        })
      );
    },
    [annotationsStore]
  );

  const updateAnnotationShortLabel = useCallback(
    (annotationId: string, shortLabel: string) => {
      if (
        !isAnnotationEntryEditable(
          findAnnotationEntryInStore(annotationsStore, annotationId)
        )
      ) {
        return;
      }

      annotationsStore.dispatch(
        updateAnnotationEntryById({
          annotationId,
          shortLabel: shortLabel.trim(),
          shortLabelSource: ANNOTATION_SHORT_LABEL_SOURCES.CUSTOM,
        })
      );
    },
    [annotationsStore]
  );

  const toggleAnnotationElevationDisplayMode = useCallback(
    (
      annotationId: string,
      currentElevationDisplayMode?: NonNullable<
        StoredAnnotation["elevationDisplayMode"]
      >
    ) => {
      const targetEntry = findAnnotationEntryInStore(
        annotationsStore,
        annotationId
      );
      if (!targetEntry) {
        return;
      }

      annotationsStore.dispatch(
        updateAnnotationEntryById({
          annotationId,
          elevationDisplayMode: resolveNextElevationDisplayMode(
            currentElevationDisplayMode ?? targetEntry.elevationDisplayMode
          ),
        })
      );
    },
    [annotationsStore]
  );

  return {
    setElevationReferenceAnnotationIdInStore,
    setPointTemporaryModeInStore,
    toggleAnnotationVisibility,
    toggleAnnotationLocked,
    updateAnnotationDisplayName,
    updateAnnotationShortLabel,
    toggleAnnotationElevationDisplayMode,
  };
};
