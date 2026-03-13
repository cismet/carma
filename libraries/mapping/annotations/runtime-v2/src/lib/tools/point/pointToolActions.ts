import type {
  RuntimeCoordinate,
  RuntimeMeasurement,
} from "../../context/AnnotationsProvider";
import {
  removeAnnotationById,
  type AnnotationsStore,
  type AnnotationsStoreState,
} from "../../store";

type AddPointMeasurementArgs = {
  toolType: RuntimeMeasurement["toolType"];
  coordinate: RuntimeCoordinate;
  addAnnotation: (
    toolType: RuntimeMeasurement["toolType"],
    nextCoordinates: readonly RuntimeCoordinate[]
  ) => RuntimeMeasurement;
};

export const addPointMeasurement = ({
  toolType,
  coordinate,
  addAnnotation,
}: AddPointMeasurementArgs) => addAnnotation(toolType, [coordinate]);

export type PointToolAction = "removeLatestPoint";

type RemovePointMeasurementArgs = {
  toolType: RuntimeMeasurement["toolType"];
  state: AnnotationsStoreState;
  dispatch: AnnotationsStore["dispatch"];
};

export const removeLatestPointMeasurement = ({
  toolType,
  state,
  dispatch,
}: RemovePointMeasurementArgs): boolean => {
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
