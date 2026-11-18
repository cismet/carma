import {
  ecefFromGeographicCoordinate,
  geographicCoordinateFromEcef,
} from "@carma-geo/proj";
import {
  buildVerticalRectangleCornerFromDiagonal,
  type AnnotationToolId,
  type AnnotationGeographicCoordinate,
} from "@carma-mapping/annotations/core";
import type {
  AddAnnotationOptions,
  AnnotationNodeLinkId,
  StoredAnnotation,
} from "@carma-mapping/annotations/runtime";

export const appendVerticalAreaPreviewPoint = <T>(
  previousItems: readonly T[],
  nextItem: T
) => [...previousItems.slice(0, 1), nextItem];

export const undoVerticalAreaPreviewPoint = <T>(previousItems: readonly T[]) =>
  previousItems.slice(0, -1);

const buildVerticalAreaMeasurementPayload = (
  coordinates: readonly AnnotationGeographicCoordinate[],
  linkedNodeGroupIds: readonly (AnnotationNodeLinkId | null | undefined)[] = []
): {
  coordinates: readonly AnnotationGeographicCoordinate[];
  options?: AddAnnotationOptions;
  linkedNodeGroupIds: readonly (AnnotationNodeLinkId | null | undefined)[];
} | null => {
  if (coordinates.length < 2) {
    return null;
  }

  const firstCornerECEF = ecefFromGeographicCoordinate(coordinates[0]!);
  const oppositeCornerECEF = ecefFromGeographicCoordinate(coordinates[1]!);
  const verticalCorners = buildVerticalRectangleCornerFromDiagonal(
    firstCornerECEF,
    oppositeCornerECEF
  );

  if (!verticalCorners) {
    return null;
  }

  const rectangleCornerPositions = [
    firstCornerECEF,
    verticalCorners.adjacentHorizontalCorner,
    oppositeCornerECEF,
    verticalCorners.adjacentVerticalCorner,
  ] as const;

  return {
    coordinates: rectangleCornerPositions.map((position) =>
      geographicCoordinateFromEcef(position)
    ),
    options: undefined,
    linkedNodeGroupIds: [
      linkedNodeGroupIds[0] ?? null,
      null,
      linkedNodeGroupIds[1] ?? null,
      null,
    ],
  };
};

type CommitVerticalAreaMeasurementArgs = {
  addAnnotation: (
    toolType: StoredAnnotation["toolType"],
    nextCoordinates: readonly AnnotationGeographicCoordinate[],
    options?: AddAnnotationOptions,
    linkedNodeGroupIds?: readonly (AnnotationNodeLinkId | null | undefined)[],
    sourceToolId?: AnnotationToolId
  ) => StoredAnnotation;
};

export const commitVerticalAreaMeasurement = (
  toolType: StoredAnnotation["toolType"],
  coordinates: readonly AnnotationGeographicCoordinate[],
  linkedNodeGroupIds: readonly (AnnotationNodeLinkId | null | undefined)[] = [],
  { addAnnotation }: CommitVerticalAreaMeasurementArgs,
  sourceToolId?: AnnotationToolId
) => {
  const payload = buildVerticalAreaMeasurementPayload(
    coordinates,
    linkedNodeGroupIds
  );
  if (!payload) {
    return null;
  }

  return addAnnotation(
    toolType,
    payload.coordinates,
    payload.options,
    payload.linkedNodeGroupIds,
    sourceToolId
  );
};
