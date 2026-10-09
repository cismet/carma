import { shortestAngleDelta } from "@carma-commons/math";
import {
  ANNOTATION_TYPES,
  computePolygonGroupDerivedData,
  ecefFromGeographicCoordinate,
  type AnnotationGeographicCoordinate,
  type NodeChainAnnotation,
  type PolygonType,
} from "@carma-mapping/annotations/core";
import { PI, zeroToTwoPi, type Radians } from "@carma-units";

import type { StoredAnnotation } from "@carma-mapping/annotations/runtime";

const derivedAreaMeasurementDefaults = Object.freeze({
  halfTurnRad: PI,
});

export type DerivedAreaMeasurement = {
  areaSquareMeters: number;
  verticalityDeg?: number;
  bearingRad?: number;
};

const { AREA_GROUND: ANNOTATION_TYPE_AREA_GROUND } = ANNOTATION_TYPES;

const getBearingDistanceRad = (
  leftBearingRad: number,
  rightBearingRad: number
): number => Math.abs(shortestAngleDelta(leftBearingRad, rightBearingRad));

const resolveStableBearingRad = ({
  derivedBearingRad,
  preferredNormalBearingRad,
}: {
  derivedBearingRad?: number;
  preferredNormalBearingRad?: number;
}): number | undefined => {
  if (!Number.isFinite(derivedBearingRad)) {
    return undefined;
  }

  const normalizedDerivedBearingRad = zeroToTwoPi(derivedBearingRad as Radians);
  if (!Number.isFinite(preferredNormalBearingRad)) {
    return normalizedDerivedBearingRad;
  }

  const normalizedPreferredNormalBearingRad = zeroToTwoPi(
    preferredNormalBearingRad as Radians
  );
  if (
    getBearingDistanceRad(
      normalizedDerivedBearingRad,
      normalizedPreferredNormalBearingRad
    ) <=
    derivedAreaMeasurementDefaults.halfTurnRad / 2
  ) {
    return normalizedDerivedBearingRad;
  }

  return zeroToTwoPi(
    (normalizedDerivedBearingRad +
      derivedAreaMeasurementDefaults.halfTurnRad) as Radians
  );
};

export const resolveDerivedAreaMeasurement = ({
  annotation,
  toolType,
  coordinates,
}: {
  annotation: StoredAnnotation;
  toolType: PolygonType;
  coordinates: readonly AnnotationGeographicCoordinate[];
}): DerivedAreaMeasurement => {
  if (coordinates.length < 3) {
    return {
      areaSquareMeters: 0,
    };
  }

  const nodeIds = coordinates.map(
    (_, index) => `${annotation.id}-derived-area-node-${index}`
  );
  const pointById = new Map(
    coordinates.map(
      (coordinate, index) =>
        [nodeIds[index]!, ecefFromGeographicCoordinate(coordinate)] as const
    )
  );
  const derivedMeasurement = computePolygonGroupDerivedData(
    {
      id: annotation.id,
      type: toolType,
      nodeIds,
      edgeRelationIds: [],
      closed: annotation.closed ?? true,
      planeLocked: toolType !== ANNOTATION_TYPE_AREA_GROUND,
    } satisfies NodeChainAnnotation,
    pointById
  );

  return {
    areaSquareMeters: Math.max(0, derivedMeasurement.areaSquareMeters ?? 0),
    verticalityDeg: Number.isFinite(derivedMeasurement.verticalityDeg)
      ? derivedMeasurement.verticalityDeg
      : undefined,
    bearingRad: resolveStableBearingRad({
      derivedBearingRad: derivedMeasurement.bearingRad,
      preferredNormalBearingRad: annotation.preferredNormalBearingRad,
    }),
  };
};
