import type {
  CesiumGeographicCoordinate,
  AnnotationNodeLinkId,
  StoredAnnotation,
} from "../../store/annotations-store.types";
import {
  removeAnnotationById,
  type AnnotationsStore,
  type AnnotationsStoreState,
} from "../../store";
import type { AnnotationToolDraftState } from "../annotation-tool-plugin.types";
type AddPointMeasurementArgs = {
  addAnnotation: (
    toolType: StoredAnnotation["toolType"],
    nextCoordinates: readonly CesiumGeographicCoordinate[],
    options?: undefined,
    linkedNodeGroupIds?: readonly (AnnotationNodeLinkId | null | undefined)[]
  ) => StoredAnnotation;
};

export const addPointMeasurement = (
  toolType: StoredAnnotation["toolType"],
  coordinate: CesiumGeographicCoordinate,
  linkedNodeGroupId: AnnotationNodeLinkId | null | undefined,
  { addAnnotation }: AddPointMeasurementArgs
) =>
  addAnnotation(toolType, [coordinate], undefined, [linkedNodeGroupId ?? null]);

export const commitPointMeasurementDraft = (
  toolType: StoredAnnotation["toolType"],
  draft: AnnotationToolDraftState,
  { addAnnotation }: AddPointMeasurementArgs
): readonly StoredAnnotation[] =>
  draft.coordinates.flatMap((coordinate, index) => [
    addAnnotation(toolType, [coordinate], undefined, [
      draft.linkedNodeGroupIds[index] ?? null,
    ]),
  ]);

export const trimLatestPointMeasurementDraft = (
  draft: AnnotationToolDraftState
): AnnotationToolDraftState => ({
  coordinates: draft.coordinates.slice(0, -1),
  linkedNodeGroupIds: draft.linkedNodeGroupIds.slice(0, -1),
});

export type PointToolAction = "removeLatestPoint";

type RemovePointMeasurementArgs = {
  state: AnnotationsStoreState;
  dispatch: AnnotationsStore["dispatch"];
};

export const removeLatestPointMeasurement = (
  toolType: StoredAnnotation["toolType"],
  { state, dispatch }: RemovePointMeasurementArgs
): boolean => {
  const selectedAnnotationId =
    state.selectionState.selectedAnnotationIds[
      state.selectionState.selectedAnnotationIds.length - 1
    ] ?? null;
  if (selectedAnnotationId) {
    return false;
  }

  const pointMeasurements = state.annotationEntries.filter(
    (annotationEntry) => annotationEntry.toolType === toolType
  );
  const latestPointMeasurement =
    pointMeasurements[pointMeasurements.length - 1] ?? null;
  if (!latestPointMeasurement) {
    return false;
  }

  const previousPointMeasurement =
    pointMeasurements[pointMeasurements.length - 2] ?? null;

  dispatch(
    removeAnnotationById({
      annotationId: latestPointMeasurement.id,
      nextSelectedAnnotationId: previousPointMeasurement?.id ?? null,
    })
  );

  return true;
};
