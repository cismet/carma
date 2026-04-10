import type {
  RuntimeCoordinate,
  RuntimeLinkedNodeGroupId,
  RuntimeMeasurement,
} from "../../context/AnnotationsProvider";

export type PolylineToolAction = "appendPoint" | "cancelPreview";

export const appendPolylinePreviewPoint = <T>(
  previousItems: readonly T[],
  nextItem: T
) => [...previousItems, nextItem];

export const clearPolylinePreview = (): readonly RuntimeCoordinate[] => [];

export const canFinishPolylinePreview = (
  coordinates: readonly RuntimeCoordinate[]
) => coordinates.length >= 2;

type FinishPolylinePreviewArgs = {
  toolType: RuntimeMeasurement["toolType"];
  coordinates: readonly RuntimeCoordinate[];
  linkedNodeGroupIds?: readonly (
    | RuntimeLinkedNodeGroupId
    | null
    | undefined
  )[];
  addAnnotation: (
    toolType: RuntimeMeasurement["toolType"],
    nextCoordinates: readonly RuntimeCoordinate[],
    options?: undefined,
    linkedNodeGroupIds?: readonly (
      | RuntimeLinkedNodeGroupId
      | null
      | undefined
    )[]
  ) => RuntimeMeasurement;
};

export const finishPolylinePreview = ({
  toolType,
  coordinates,
  linkedNodeGroupIds,
  addAnnotation,
}: FinishPolylinePreviewArgs) => {
  if (!canFinishPolylinePreview(coordinates)) {
    return null;
  }

  return addAnnotation(toolType, coordinates, undefined, linkedNodeGroupIds);
};
