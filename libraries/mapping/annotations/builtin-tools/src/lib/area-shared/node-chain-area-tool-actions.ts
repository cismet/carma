import type {
  AnnotationToolId,
  AnnotationTypes,
} from "@carma-mapping/annotations/core";
import type {
  AddAnnotationOptions,
  CesiumGeographicCoordinate,
  AnnotationNodeLinkId,
  StoredAnnotation,
} from "@carma-mapping/annotations/runtime";
export type NodeChainAreaToolAction = "undoLastPoint" | "cancelPreview";

export const appendAreaPreviewPoint = <T>(
  previousItems: readonly T[],
  nextItem: T
) => [...previousItems, nextItem];

export const undoAreaPreviewPoint = <T>(previousItems: readonly T[]) =>
  previousItems.slice(0, -1);

export const commitAreaMeasurement = ({
  toolType,
  coordinates,
  linkedNodeGroupIds,
  addAnnotation,
  sourceToolId,
}: {
  toolType: AnnotationTypes["AREA_GROUND"] | AnnotationTypes["AREA_PLANAR"];
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
}) => {
  if (coordinates.length < 3) {
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
