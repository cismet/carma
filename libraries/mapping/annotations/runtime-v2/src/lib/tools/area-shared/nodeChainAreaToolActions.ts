import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  computePolygonGroupDerivedData,
  type NodeChainAnnotation,
} from "@carma-mapping/annotations/core";
import { Cartesian3 } from "@carma-cesium";

import type {
  RuntimeAddAnnotationOptions,
  RuntimeCoordinate,
  RuntimeMeasurement,
} from "../../store";

type RuntimeAreaToolType =
  | typeof ANNOTATION_TYPE_AREA_GROUND
  | typeof ANNOTATION_TYPE_AREA_PLANAR;

export type NodeChainAreaToolAction = "undoLastPoint" | "cancelPreview";

export const appendAreaPreviewPoint = (
  previousCoordinates: readonly RuntimeCoordinate[],
  coordinate: RuntimeCoordinate
) => [...previousCoordinates, coordinate];

export const undoAreaPreviewPoint = (
  previousCoordinates: readonly RuntimeCoordinate[]
) => previousCoordinates.slice(0, -1);

const cartesianFromRuntimeCoordinate = ({
  longitude,
  latitude,
  altitude,
}: RuntimeCoordinate): Cartesian3 =>
  Cartesian3.fromDegrees(longitude, latitude, altitude);

const deriveAreaAnnotationOptions = ({
  toolType,
  coordinates,
}: {
  toolType: RuntimeAreaToolType;
  coordinates: readonly RuntimeCoordinate[];
}): RuntimeAddAnnotationOptions => {
  const pointById = new Map(
    coordinates.map((coordinate, index) => [
      `area-node-${index}`,
      cartesianFromRuntimeCoordinate(coordinate),
    ])
  );

  const derivedMeasurement = computePolygonGroupDerivedData(
    {
      id: "area-preview",
      type: toolType,
      nodeIds: coordinates.map((_, index) => `area-node-${index}`),
      edgeRelationIds: [],
      closed: true,
      planeLocked: toolType === ANNOTATION_TYPE_AREA_PLANAR,
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

export const commitAreaMeasurement = ({
  toolType,
  coordinates,
  addAnnotation,
}: {
  toolType: RuntimeAreaToolType;
  coordinates: readonly RuntimeCoordinate[];
  addAnnotation: (
    toolType: RuntimeMeasurement["toolType"],
    nextCoordinates: readonly RuntimeCoordinate[],
    options?: RuntimeAddAnnotationOptions
  ) => RuntimeMeasurement;
}) => {
  if (coordinates.length < 3) {
    return null;
  }

  return addAnnotation(toolType, coordinates, deriveAreaAnnotationOptions({
    toolType,
    coordinates,
  }));
};
