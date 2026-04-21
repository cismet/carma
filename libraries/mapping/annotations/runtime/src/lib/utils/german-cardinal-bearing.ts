import {
  CarmaTransforms,
  cartesian3FromGeographicCoordinate,
} from "@carma-mapping/engines/cesium/core";
import { formatDegrees, radToDegNumeric } from "@carma-units";

import type { CesiumGeographicCoordinate } from "../store";

const germanCardinalBearingDefaults = Object.freeze({
  horizontalMagnitudeEpsilonMeters: 1e-6,
  sectorSpanDeg: 45,
  directionNames: [
    "Nord",
    "Nordost",
    "Ost",
    "Südost",
    "Süd",
    "Südwest",
    "West",
    "Nordwest",
  ] as const,
});

const normalizeBearingDeg = (bearingDeg: number): number =>
  ((bearingDeg % 360) + 360) % 360;

const formatRoundedBearingDegrees = (bearingDeg: number): string =>
  formatDegrees(Math.round(normalizeBearingDeg(bearingDeg)) % 360, {
    fractionDigits: 0,
  });

export const formatGermanCardinalBearing = (bearingDeg: number): string => {
  const normalizedBearingDeg = normalizeBearingDeg(bearingDeg);
  const directionIndex =
    Math.round(
      normalizedBearingDeg / germanCardinalBearingDefaults.sectorSpanDeg
    ) % germanCardinalBearingDefaults.directionNames.length;

  return `${germanCardinalBearingDefaults.directionNames[directionIndex]!} (${formatRoundedBearingDegrees(
    normalizedBearingDeg
  )})`;
};

export const resolveBearingDegFromFirstToLastCoordinate = (
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
    cartesian3FromGeographicCoordinate(startCoordinate),
    cartesian3FromGeographicCoordinate(endCoordinate)
  );
  if (
    Math.hypot(enuOffset.east, enuOffset.north) <=
    germanCardinalBearingDefaults.horizontalMagnitudeEpsilonMeters
  ) {
    return null;
  }

  return normalizeBearingDeg(radToDegNumeric(Math.atan2(enuOffset.east, enuOffset.north)) ?? 0);
};
