import type {
  RuntimeCoordinate,
  RuntimeMeasurement,
} from "../../context/AnnotationsProvider";

export type DistanceToolAction = "undoLastPoint" | "cancelPreview";

export const appendDistancePreviewPoint = (
  previousCoordinates: readonly RuntimeCoordinate[],
  coordinate: RuntimeCoordinate
) => [...previousCoordinates.slice(0, 1), coordinate];

export const clearDistancePreview = (): readonly RuntimeCoordinate[] => [];

export const undoDistancePreviewPoint = (
  previousCoordinates: readonly RuntimeCoordinate[]
) => previousCoordinates.slice(0, -1);

type CommitDistanceMeasurementArgs = {
  toolType: RuntimeMeasurement["toolType"];
  coordinates: readonly RuntimeCoordinate[];
  addAnnotation: (
    toolType: RuntimeMeasurement["toolType"],
    nextCoordinates: readonly RuntimeCoordinate[]
  ) => RuntimeMeasurement;
};

export const commitDistanceMeasurement = ({
  toolType,
  coordinates,
  addAnnotation,
}: CommitDistanceMeasurementArgs) => {
  if (coordinates.length < 2) {
    return null;
  }

  return addAnnotation(toolType, coordinates);
};
