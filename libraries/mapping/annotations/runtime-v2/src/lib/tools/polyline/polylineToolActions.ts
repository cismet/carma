import type {
  RuntimeCoordinate,
  RuntimeMeasurement,
} from "../../context/AnnotationsProvider";

export type PolylineToolAction = "appendPoint" | "cancelPreview";

export const appendPolylinePreviewPoint = (
  previousCoordinates: readonly RuntimeCoordinate[],
  coordinate: RuntimeCoordinate
) => [...previousCoordinates, coordinate];

export const clearPolylinePreview = (): readonly RuntimeCoordinate[] => [];

export const canFinishPolylinePreview = (
  coordinates: readonly RuntimeCoordinate[]
) => coordinates.length >= 2;

type FinishPolylinePreviewArgs = {
  toolType: RuntimeMeasurement["toolType"];
  coordinates: readonly RuntimeCoordinate[];
  addAnnotation: (
    toolType: RuntimeMeasurement["toolType"],
    nextCoordinates: readonly RuntimeCoordinate[]
  ) => RuntimeMeasurement;
};

export const finishPolylinePreview = ({
  toolType,
  coordinates,
  addAnnotation,
}: FinishPolylinePreviewArgs) => {
  if (!canFinishPolylinePreview(coordinates)) {
    return null;
  }

  return addAnnotation(toolType, coordinates);
};
