import { useCallback, type Dispatch, type SetStateAction } from "react";

import type { AnnotationEngine } from "../engine";
import {
  selectAllAnnotationIds,
  selectAdjacentAnnotationEntryId,
  selectSelectedAnnotationId,
  setSelectedAnnotationId,
  setSelectedAnnotationIds,
  type AnnotationsStore,
} from "../store";
import { resolveAnnotationEntryEcefPoints } from "../utils/annotation-coordinates";
import { selectAuthoringAnnotationEntries } from "../utils/annotation-tool-collections";
import { flyToAnnotationPoints } from "./annotation-fly-to";

type UseAnnotationFocusOptions = {
  engine: AnnotationEngine | null;
  annotationsStore: AnnotationsStore;
  setActiveEditedNodeId: Dispatch<SetStateAction<string | null>>;
};

/** Selection, focus and fly-to of annotations; a cleared selection closes node editing. */
export const useAnnotationFocus = ({
  engine,
  annotationsStore,
  setActiveEditedNodeId,
}: UseAnnotationFocusOptions) => {
  const setSelectedAnnotationIdInStore = useCallback(
    (annotationId: string | null) => {
      if (annotationId === null) {
        setActiveEditedNodeId(null);
      }
      annotationsStore.dispatch(setSelectedAnnotationId(annotationId));
    },
    [annotationsStore, setActiveEditedNodeId]
  );

  const setSelectedAnnotationIdsInStore = useCallback(
    (annotationIds: readonly string[]) => {
      if (annotationIds.length === 0) {
        setActiveEditedNodeId(null);
      }
      annotationsStore.dispatch(setSelectedAnnotationIds(annotationIds));
    },
    [annotationsStore, setActiveEditedNodeId]
  );

  const selectAllAnnotationEntries = useCallback(() => {
    annotationsStore.dispatch(
      setSelectedAnnotationIds(
        selectAllAnnotationIds(annotationsStore.getState())
      )
    );
  }, [annotationsStore]);

  const focusAdjacentAnnotationEntry = useCallback(
    (offset: -1 | 1) => {
      const runtimeState = annotationsStore.getState();
      annotationsStore.dispatch(
        setSelectedAnnotationId(
          selectAdjacentAnnotationEntryId(
            runtimeState.annotationEntries,
            selectSelectedAnnotationId(runtimeState),
            offset
          )
        )
      );
    },
    [annotationsStore]
  );

  const flyToAnnotationById = useCallback(
    (annotationId: string | null) => {
      const runtimeState = annotationsStore.getState();
      flyToAnnotationPoints({
        engine,
        points: resolveAnnotationEntryEcefPoints({
          annotationEntries: runtimeState.annotationEntries,
          nodes: runtimeState.nodes,
          annotationId,
        }),
      });
    },
    [annotationsStore, engine]
  );

  const flyToAllAnnotations = useCallback(() => {
    const runtimeState = annotationsStore.getState();
    flyToAnnotationPoints({
      engine,
      points: selectAuthoringAnnotationEntries(runtimeState).flatMap(
        (annotationEntry) =>
          resolveAnnotationEntryEcefPoints({
            annotationEntries: runtimeState.annotationEntries,
            nodes: runtimeState.nodes,
            annotationId: annotationEntry.id,
          })
      ),
    });
  }, [annotationsStore, engine]);

  const focusAnnotationId = useCallback(
    (annotationId: string | null) => {
      if (annotationId === null) {
        setActiveEditedNodeId(null);
      }
      annotationsStore.dispatch(setSelectedAnnotationId(annotationId));
      flyToAnnotationById(annotationId);
    },
    [annotationsStore, flyToAnnotationById, setActiveEditedNodeId]
  );

  return {
    setSelectedAnnotationIdInStore,
    setSelectedAnnotationIdsInStore,
    selectAllAnnotationEntries,
    focusAdjacentAnnotationEntry,
    flyToAnnotationById,
    flyToAllAnnotations,
    focusAnnotationId,
  };
};
