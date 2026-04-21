import { Cartesian3 } from "@carma-cesium";
import {
  ANNOTATION_TYPES,
  computePolygonGroupDerivedData,
  type NodeChainAnnotation,
  type PolygonType,
} from "@carma-mapping/annotations/core";

import type {
  CesiumGeographicCoordinate,
  StoredAnnotation,
} from "../../store/annotations-store.types";

const derivedAreaMeasurementDefaults = Object.freeze({
  bearingHalfTurnDeg: 180,
  fullTurnDeg: 360,
});

export type DerivedAreaMeasurement = {
  areaSquareMeters: number;
  verticalityDeg?: number;
  bearingDeg?: number;
};

const { AREA_GROUND: ANNOTATION_TYPE_AREA_GROUND } = ANNOTATION_TYPES;

const cartesianFromRuntimeCoordinate = ({
  longitude,
  latitude,
  altitude,
}: CesiumGeographicCoordinate): Cartesian3 =>
  Cartesian3.fromDegrees(longitude, latitude, altitude);

const normalizeBearingDeg = (bearingDeg: number): number =>
  ((bearingDeg % derivedAreaMeasurementDefaults.fullTurnDeg) +
    derivedAreaMeasurementDefaults.fullTurnDeg) %
  derivedAreaMeasurementDefaults.fullTurnDeg;

const getBearingDistanceDeg = (
  leftBearingDeg: number,
  rightBearingDeg: number
): number => {
  const normalizedDifference = Math.abs(
    normalizeBearingDeg(leftBearingDeg) - normalizeBearingDeg(rightBearingDeg)
  );

  return Math.min(
    normalizedDifference,
    derivedAreaMeasurementDefaults.fullTurnDeg - normalizedDifference
  );
};

const resolveStableBearingDeg = ({
  derivedBearingDeg,
  preferredNormalBearingDeg,
}: {
  derivedBearingDeg?: number;
  preferredNormalBearingDeg?: number;
}): number | undefined => {
  if (!Number.isFinite(derivedBearingDeg)) {
    return undefined;
  }

  const normalizedDerivedBearingDeg = normalizeBearingDeg(derivedBearingDeg ?? 0);
  if (!Number.isFinite(preferredNormalBearingDeg)) {
    return normalizedDerivedBearingDeg;
  }

  const flippedBearingDeg = normalizeBearingDeg(
    normalizedDerivedBearingDeg + derivedAreaMeasurementDefaults.bearingHalfTurnDeg
  );

  return getBearingDistanceDeg(
    normalizedDerivedBearingDeg,
    preferredNormalBearingDeg ?? 0
  ) <=
    getBearingDistanceDeg(flippedBearingDeg, preferredNormalBearingDeg ?? 0)
    ? normalizedDerivedBearingDeg
    : flippedBearingDeg;
};

export const resolveDerivedAreaMeasurement = ({
  measurement,
  toolType,
  coordinates,
}: {
  measurement: StoredAnnotation;
  toolType: PolygonType;
  coordinates: readonly CesiumGeographicCoordinate[];
}): DerivedAreaMeasurement => {
  if (coordinates.length < 3) {
    return {
      areaSquareMeters: 0,
    };
  }

  const nodeIds = coordinates.map(
    (_, index) => `${measurement.id}-derived-area-node-${index}`
  );
  const pointById = new Map(
    coordinates.map((coordinate, index) => [
      nodeIds[index]!,
      cartesianFromRuntimeCoordinate(coordinate),
    ] as const)
  );
  const derivedMeasurement = computePolygonGroupDerivedData(
    {
      id: measurement.id,
      type: toolType,
      nodeIds,
      edgeRelationIds: [],
      closed: measurement.closed ?? true,
      planeLocked: toolType !== ANNOTATION_TYPE_AREA_GROUND,
    } satisfies NodeChainAnnotation,
    pointById
  );

  return {
    areaSquareMeters: Math.max(0, derivedMeasurement.areaSquareMeters ?? 0),
    verticalityDeg: Number.isFinite(derivedMeasurement.verticalityDeg)
      ? derivedMeasurement.verticalityDeg
      : undefined,
    bearingDeg: resolveStableBearingDeg({
      derivedBearingDeg: derivedMeasurement.bearingDeg,
      preferredNormalBearingDeg: measurement.preferredNormalBearingDeg,
    }),
  };
};
