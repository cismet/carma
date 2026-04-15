import type {
  RuntimeCoordinate,
  RuntimeNodeLinkId,
  RuntimeMeasurement,
} from "../../store/annotations-store.types";
import {
  removeAnnotationById,
  type AnnotationsStore,
  type AnnotationsStoreState,
} from "../../store";
type AddPointMeasurementArgs = {
  addAnnotation: (
    toolType: RuntimeMeasurement["toolType"],
    nextCoordinates: readonly RuntimeCoordinate[],
    options?: undefined,
    linkedNodeGroupIds?: readonly (RuntimeNodeLinkId | null | undefined)[]
  ) => RuntimeMeasurement;
};

export const addPointMeasurement = (
  toolType: RuntimeMeasurement["toolType"],
  coordinate: RuntimeCoordinate,
  linkedNodeGroupId: RuntimeNodeLinkId | null | undefined,
  { addAnnotation }: AddPointMeasurementArgs
) =>
  addAnnotation(toolType, [coordinate], undefined, [linkedNodeGroupId ?? null]);

export type PointToolAction = "removeLatestPoint";

type RemovePointMeasurementArgs = {
  state: AnnotationsStoreState;
  dispatch: AnnotationsStore["dispatch"];
};

export const removeLatestPointMeasurement = (
  toolType: RuntimeMeasurement["toolType"],
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
