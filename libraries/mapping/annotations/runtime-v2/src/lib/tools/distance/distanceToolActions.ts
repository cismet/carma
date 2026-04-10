import type {
  RuntimeCoordinate,
  RuntimeLinkedNodeGroupId,
  RuntimeMeasurement,
} from "../../context/AnnotationsProvider";
import type { RuntimeAddAnnotationOptions } from "../../store";

export type DistanceToolAction = "undoLastPoint" | "cancelPreview";

export const appendDistancePreviewPoint = <T>(
  previousItems: readonly T[],
  nextItem: T
) => [...previousItems.slice(0, 1), nextItem];

export const clearDistancePreview = (): readonly RuntimeCoordinate[] => [];

export const undoDistancePreviewPoint = <T>(previousItems: readonly T[]) =>
  previousItems.slice(0, -1);

type CommitDistanceMeasurementArgs = {
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
    options?: RuntimeAddAnnotationOptions,
    linkedNodeGroupIds?: readonly (
      | RuntimeLinkedNodeGroupId
      | null
      | undefined
    )[]
  ) => RuntimeMeasurement;
};

export const commitDistanceMeasurement = ({
  toolType,
  coordinates,
  linkedNodeGroupIds,
  addAnnotation,
}: CommitDistanceMeasurementArgs) => {
  if (coordinates.length < 2) {
    return null;
  }

  return addAnnotation(toolType, coordinates, undefined, linkedNodeGroupIds);
};
