import type {
  CesiumGeographicCoordinate,
  AnnotationNodeLinkId,
  StoredAnnotation,
} from "@carma-mapping/annotations/runtime";
import type { AnnotationToolId } from "@carma-mapping/annotations/runtime";

export type PolylineToolAction = "appendPoint" | "cancelPreview";

export const appendPolylinePreviewPoint = <T>(
  previousItems: readonly T[],
  nextItem: T
) => [...previousItems, nextItem];

export const clearPolylinePreview =
  (): readonly CesiumGeographicCoordinate[] => [];

export const canFinishPolylinePreview = (
  coordinates: readonly CesiumGeographicCoordinate[]
) => coordinates.length >= 2;

type FinishPolylinePreviewArgs = {
  toolType: StoredAnnotation["toolType"];
  coordinates: readonly CesiumGeographicCoordinate[];
  linkedNodeGroupIds?: readonly (AnnotationNodeLinkId | null | undefined)[];
  addAnnotation: (
    toolType: StoredAnnotation["toolType"],
    nextCoordinates: readonly CesiumGeographicCoordinate[],
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
