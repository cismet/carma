import type {
  AnnotationToolId,
  AnnotationGeographicCoordinate,
} from "@carma-mapping/annotations/core";
import type {
  AnnotationNodeLinkId,
  StoredAnnotation,
} from "@carma-mapping/annotations/runtime";

export type PolylineToolAction = "appendPoint" | "cancelPreview";

export const appendPolylinePreviewPoint = <T>(
  previousItems: readonly T[],
  nextItem: T
) => [...previousItems, nextItem];

export const clearPolylinePreview =
  (): readonly AnnotationGeographicCoordinate[] => [];

export const canFinishPolylinePreview = (
  coordinates: readonly AnnotationGeographicCoordinate[]
) => coordinates.length >= 2;

type FinishPolylinePreviewArgs = {
  toolType: StoredAnnotation["toolType"];
  coordinates: readonly AnnotationGeographicCoordinate[];
  linkedNodeGroupIds?: readonly (AnnotationNodeLinkId | null | undefined)[];
  addAnnotation: (
    toolType: StoredAnnotation["toolType"],
    nextCoordinates: readonly AnnotationGeographicCoordinate[],
    options?: undefined,
    linkedNodeGroupIds?: readonly (AnnotationNodeLinkId | null | undefined)[],
    sourceToolId?: AnnotationToolId
  ) => StoredAnnotation;
  sourceToolId?: AnnotationToolId;
};

export const finishPolylinePreview = ({
  toolType,
  coordinates,
  linkedNodeGroupIds,
  addAnnotation,
  sourceToolId,
}: FinishPolylinePreviewArgs) => {
  if (!canFinishPolylinePreview(coordinates)) {
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
