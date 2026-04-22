import {
  buildVerticalRectangleCornerFromDiagonal,
} from "@carma-mapping/annotations/core";
import { Cartesian3 } from "@carma-cesium";
import {
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
} from "@carma-mapping/engines/cesium/core";
import type {
  AddAnnotationOptions,
  CesiumGeographicCoordinate,
  AnnotationNodeLinkId,
  StoredAnnotation,
} from "@carma-mapping/annotations/runtime";
import type { AnnotationToolId } from "@carma-mapping/annotations/runtime";
export type VerticalAreaToolAction = "undoLastPoint" | "cancelPreview";

export const appendVerticalAreaPreviewPoint = <T>(
  previousItems: readonly T[],
  nextItem: T
) => [...previousItems.slice(0, 1), nextItem];

export const clearVerticalAreaPreview = (): readonly CesiumGeographicCoordinate[] => [];

export const undoVerticalAreaPreviewPoint = <T>(previousItems: readonly T[]) =>
  previousItems.slice(0, -1);

const cartesianFromRuntimeCoordinate = ({
  longitude,
  latitude,
  altitude,
}: CesiumGeographicCoordinate): Cartesian3 =>
  Cartesian3.fromDegrees(longitude, latitude, altitude);

const runtimeCoordinateFromCartesian = (
  coordinateECEF: Cartesian3
): CesiumGeographicCoordinate => {
  const coordinateWgs84 = getDegreesFromCartesian(coordinateECEF);

  return {
    longitude: coordinateWgs84.longitude,
    latitude: coordinateWgs84.latitude,
    altitude: getEllipsoidalAltitudeOrZero(coordinateWgs84.altitude),
  };
};

const buildVerticalAreaMeasurementPayload = (
  coordinates: readonly CesiumGeographicCoordinate[],
  linkedNodeGroupIds: readonly (AnnotationNodeLinkId | null | undefined)[] = []
): {
  coordinates: readonly CesiumGeographicCoordinate[];
  options?: AddAnnotationOptions;
  linkedNodeGroupIds: readonly (AnnotationNodeLinkId | null | undefined)[];
} | null => {
  if (coordinates.length < 2) {
    return null;
  }

  const firstCornerECEF = cartesianFromRuntimeCoordinate(coordinates[0]!);
  const oppositeCornerECEF = cartesianFromRuntimeCoordinate(coordinates[1]!);
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
    coordinates: rectangleCornerPositions.map(runtimeCoordinateFromCartesian),
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
    nextCoordinates: readonly CesiumGeographicCoordinate[],
    options?: AddAnnotationOptions,
    linkedNodeGroupIds?: readonly (AnnotationNodeLinkId | null | undefined)[],
    sourceToolId?: AnnotationToolId
  ) => StoredAnnotation;
};

export const commitVerticalAreaMeasurement = (
  toolType: StoredAnnotation["toolType"],
  coordinates: readonly CesiumGeographicCoordinate[],
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
