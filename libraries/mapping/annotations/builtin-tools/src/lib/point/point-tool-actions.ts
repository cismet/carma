import type { AnnotationToolId } from "@carma-mapping/annotations/core";
import type {
  CesiumGeographicCoordinate,
  AnnotationNodeLinkId,
  StoredAnnotation,
} from "@carma-mapping/annotations/runtime";
import {
  removeAnnotationById,
  setElevationReferenceAnnotationId,
  type AnnotationsStore,
  type AnnotationsStoreState,
} from "@carma-mapping/annotations/runtime";
import type { AnnotationToolDraftState } from "@carma-mapping/annotations/runtime";
type AddPointAnnotationArgs = {
  addAnnotation: (
    toolType: StoredAnnotation["toolType"],
    nextCoordinates: readonly CesiumGeographicCoordinate[],
    options?: undefined,
    linkedNodeGroupIds?: readonly (AnnotationNodeLinkId | null | undefined)[],
    sourceToolId?: AnnotationToolId
  ) => StoredAnnotation;
  state: AnnotationsStoreState;
  dispatch: AnnotationsStore["dispatch"];
};

const setFirstPointAnnotationAsElevationReference = ({
  toolType,
  state,
  dispatch,
  annotations,
}: {
  toolType: StoredAnnotation["toolType"];
  state: AnnotationsStoreState;
  dispatch: AnnotationsStore["dispatch"];
  annotations: readonly StoredAnnotation[];
}) => {
  const hasExistingPointAnnotation = state.annotationEntries.some(
    (annotationEntry) => annotationEntry.toolType === toolType
  );
  const firstAnnotation = annotations[0] ?? null;

  if (hasExistingPointAnnotation || !firstAnnotation) {
    return;
  }

  dispatch(setElevationReferenceAnnotationId(firstAnnotation.id));
};

export const addPointAnnotation = (
  toolType: StoredAnnotation["toolType"],
  coordinate: CesiumGeographicCoordinate,
  linkedNodeGroupId: AnnotationNodeLinkId | null | undefined,
  { addAnnotation, state, dispatch }: AddPointAnnotationArgs,
  sourceToolId?: AnnotationToolId
) => {
  const annotation = addAnnotation(
    toolType,
    [coordinate],
    undefined,
    [linkedNodeGroupId ?? null],
    sourceToolId
  );

  setFirstPointAnnotationAsElevationReference({
    toolType,
    state,
    dispatch,
    annotations: [annotation],
  });

  return annotation;
};

export const commitPointAnnotationDraft = (
  toolType: StoredAnnotation["toolType"],
  draft: AnnotationToolDraftState,
  { addAnnotation, state, dispatch }: AddPointAnnotationArgs,
  sourceToolId?: AnnotationToolId
): readonly StoredAnnotation[] => {
  const annotations = draft.coordinates.flatMap((coordinate, index) => [
    addAnnotation(
      toolType,
      [coordinate],
      undefined,
      [draft.linkedNodeGroupIds[index] ?? null],
      sourceToolId
    ),
  ]);

  setFirstPointAnnotationAsElevationReference({
    toolType,
    state,
    dispatch,
    annotations,
  });

  return annotations;
};

export const trimLatestPointAnnotationDraft = (
  draft: AnnotationToolDraftState
): AnnotationToolDraftState => ({
  coordinates: draft.coordinates.slice(0, -1),
  linkedNodeGroupIds: draft.linkedNodeGroupIds.slice(0, -1),
});

export type PointToolAction = "removeLatestPoint";

type RemovePointAnnotationArgs = {
  state: AnnotationsStoreState;
  dispatch: AnnotationsStore["dispatch"];
};

export const removeLatestPointAnnotation = (
  toolType: StoredAnnotation["toolType"],
  { state, dispatch }: RemovePointAnnotationArgs
): boolean => {
  const selectedAnnotationId =
    state.selectionState.selectedAnnotationIds[
      state.selectionState.selectedAnnotationIds.length - 1
    ] ?? null;
  if (selectedAnnotationId) {
    return false;
  }

  const pointAnnotations = state.annotationEntries.filter(
    (annotationEntry) => annotationEntry.toolType === toolType
  );
  const latestPointAnnotation =
    pointAnnotations[pointAnnotations.length - 1] ?? null;
  if (!latestPointAnnotation) {
    return false;
  }

  const previousPointAnnotation =
    pointAnnotations[pointAnnotations.length - 2] ?? null;

  dispatch(
    removeAnnotationById({
      annotationId: latestPointAnnotation.id,
      nextSelectedAnnotationId: previousPointAnnotation?.id ?? null,
    })
  );

  return true;
};
