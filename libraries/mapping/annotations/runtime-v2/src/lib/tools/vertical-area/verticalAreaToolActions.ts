import {
  ANNOTATION_TYPE_AREA_VERTICAL,
  buildVerticalRectangleCornerFromDiagonal,
  computePolygonGroupDerivedData,
  type NodeChainAnnotation,
} from "@carma-mapping/annotations/core";
import { Cartesian3 } from "@carma-cesium";
import {
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
} from "@carma-mapping/engines/cesium/core";

import type {
  RuntimeAddAnnotationOptions,
  RuntimeCoordinate,
  RuntimeLinkedNodeGroupId,
  RuntimeMeasurement,
} from "../../store";
export type VerticalAreaToolAction = "undoLastPoint" | "cancelPreview";

export const appendVerticalAreaPreviewPoint = <T>(
  previousItems: readonly T[],
  nextItem: T
) => [...previousItems.slice(0, 1), nextItem];

export const clearVerticalAreaPreview = (): readonly RuntimeCoordinate[] => [];

export const undoVerticalAreaPreviewPoint = <T>(previousItems: readonly T[]) =>
  previousItems.slice(0, -1);

const cartesianFromRuntimeCoordinate = ({
  longitude,
  latitude,
  altitude,
}: RuntimeCoordinate): Cartesian3 =>
  Cartesian3.fromDegrees(longitude, latitude, altitude);

const runtimeCoordinateFromCartesian = (
  coordinateECEF: Cartesian3
): RuntimeCoordinate => {
  const coordinateWgs84 = getDegreesFromCartesian(coordinateECEF);

  return {
    longitude: coordinateWgs84.longitude,
    latitude: coordinateWgs84.latitude,
    altitude: getEllipsoidalAltitudeOrZero(coordinateWgs84.altitude),
  };
};

const deriveVerticalAreaAnnotationOptions = (
  rectangleCornerPositions: readonly Cartesian3[]
): RuntimeAddAnnotationOptions => {
  const pointById = new Map(
    rectangleCornerPositions.map((position, index) => [
      `vertical-area-node-${index}`,
      position,
    ])
  );

  const derivedMeasurement = computePolygonGroupDerivedData(
    {
      id: "vertical-area-preview",
      type: ANNOTATION_TYPE_AREA_VERTICAL,
      nodeIds: [
        "vertical-area-node-0",
        "vertical-area-node-1",
        "vertical-area-node-2",
        "vertical-area-node-3",
      ],
      edgeRelationIds: [],
      closed: true,
      planeLocked: true,
      areaSquareMeters: 0,
      verticalityDeg: 0,
    } satisfies NodeChainAnnotation,
    pointById
  );

  return {
    closed: true,
    areaSquareMeters: Math.max(0, derivedMeasurement.areaSquareMeters ?? 0),
    verticalityDeg: derivedMeasurement.verticalityDeg ?? 0,
    bearingDeg: derivedMeasurement.bearingDeg,
  };
};

const buildVerticalAreaMeasurementPayload = (
  coordinates: readonly RuntimeCoordinate[],
  linkedNodeGroupIds: readonly (
    | RuntimeLinkedNodeGroupId
    | null
    | undefined
  )[] = []
): {
  coordinates: readonly RuntimeCoordinate[];
  options: RuntimeAddAnnotationOptions;
  linkedNodeGroupIds: readonly (
    | RuntimeLinkedNodeGroupId
    | null
    | undefined
  )[];
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
    options: deriveVerticalAreaAnnotationOptions(rectangleCornerPositions),
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

export const commitVerticalAreaMeasurement = (
  toolType: RuntimeMeasurement["toolType"],
  coordinates: readonly RuntimeCoordinate[],
  linkedNodeGroupIds: readonly (
    | RuntimeLinkedNodeGroupId
    | null
    | undefined
  )[] = [],
  { addAnnotation }: CommitVerticalAreaMeasurementArgs
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
    payload.linkedNodeGroupIds
  );
};
