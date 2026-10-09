import {
  ecefFromGeographicCoordinate,
  getEastNorthUpOffset,
} from "@carma-mapping/annotations/core";
import { zeroToTwoPi, type Radians } from "@carma-units";

import type { AnnotationGeographicCoordinate } from "../store";

const resolveBearingRadDefaults = Object.freeze({
  horizontalMagnitudeEpsilonMeters: 1e-6,
});

export const resolveBearingRadFromFirstToLastCoordinate = (
  coordinates: readonly AnnotationGeographicCoordinate[]
): number | null => {
  if (coordinates.length < 2) {
    return null;
  }

  const startCoordinate = coordinates[0];
  const endCoordinate = coordinates[coordinates.length - 1];
  if (!startCoordinate || !endCoordinate) {
    return null;
  }

  const enuOffset = getEastNorthUpOffset(
    ecefFromGeographicCoordinate(endCoordinate),
    ecefFromGeographicCoordinate(startCoordinate)
  );
  if (
    Math.hypot(enuOffset.east, enuOffset.north) <=
    resolveBearingRadDefaults.horizontalMagnitudeEpsilonMeters
  ) {
    return null;
  }

  return zeroToTwoPi(Math.atan2(enuOffset.east, enuOffset.north) as Radians);
};
