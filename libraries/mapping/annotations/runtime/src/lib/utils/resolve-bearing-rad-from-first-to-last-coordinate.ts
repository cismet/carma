import {
  CarmaTransforms,
  cartesian3FromGeographicCoordinate,
} from "@carma-mapping/engines/cesium/core";
import { zeroToTwoPi, type Radians } from "@carma-units";

import type { CesiumGeographicCoordinate } from "../store";

const resolveBearingRadDefaults = Object.freeze({
  horizontalMagnitudeEpsilonMeters: 1e-6,
});

export const resolveBearingRadFromFirstToLastCoordinate = (
  coordinates: readonly CesiumGeographicCoordinate[]
): number | null => {
  if (coordinates.length < 2) {
    return null;
  }

  const startCoordinate = coordinates[0];
  const endCoordinate = coordinates[coordinates.length - 1];
  if (!startCoordinate || !endCoordinate) {
    return null;
  }

  const enuOffset = CarmaTransforms.getEastNorthUpOffset(
    cartesian3FromGeographicCoordinate(endCoordinate),
    cartesian3FromGeographicCoordinate(startCoordinate)
  );
  if (
    Math.hypot(enuOffset.east, enuOffset.north) <=
    resolveBearingRadDefaults.horizontalMagnitudeEpsilonMeters
  ) {
    return null;
  }

  return zeroToTwoPi(Math.atan2(enuOffset.east, enuOffset.north) as Radians);
};
