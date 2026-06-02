import type { AnnotationToolId } from "@carma-mapping/annotations/core";
import type {
  AddAnnotationOptions,
  CesiumGeographicCoordinate,
  AnnotationNodeLinkId,
  StoredAnnotation,
} from "@carma-mapping/annotations/runtime";

export type DistanceToolAction = "undoLastPoint" | "cancelPreview";

export const appendDistancePreviewPoint = <T>(
  previousItems: readonly T[],
  nextItem: T
) => [...previousItems.slice(0, 1), nextItem];

export const clearDistancePreview =
  (): readonly CesiumGeographicCoordinate[] => [];

export const undoDistancePreviewPoint = <T>(previousItems: readonly T[]) =>
  previousItems.slice(0, -1);

type CommitDistanceMeasurementArgs = {
  toolType: StoredAnnotation["toolType"];
  coordinates: readonly CesiumGeographicCoordinate[];
  linkedNodeGroupIds?: readonly (AnnotationNodeLinkId | null | undefined)[];
  addAnnotation: (
    toolType: StoredAnnotation["toolType"],
    nextCoordinates: readonly CesiumGeographicCoordinate[],
    options?: AddAnnotationOptions,
    linkedNodeGroupIds?: readonly (AnnotationNodeLinkId | null | undefined)[],
    sourceToolId?: AnnotationToolId
  ) => StoredAnnotation;
  sourceToolId?: AnnotationToolId;
};

export const commitDistanceMeasurement = ({
  toolType,
  coordinates,
  linkedNodeGroupIds,
  addAnnotation,
  sourceToolId,
}: CommitDistanceMeasurementArgs) => {
  if (coordinates.length < 2) {
    return null;
  }

  return addAnnotation(
    toolType,
    coordinates,
    undefined,
    linkedNodeGroupIds,
    sourceToolId
  );
};
