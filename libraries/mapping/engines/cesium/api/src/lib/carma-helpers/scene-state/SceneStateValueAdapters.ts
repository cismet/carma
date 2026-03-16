import {
  coerceMat4,
  coerceQuat,
  coerceVec3,
  isFiniteNumber,
} from "@carma/math";
import type { LatLngAlt } from "@carma/geo/types";
import type { Mat4, Quat, Vec3 } from "@carma/types";

export const toSceneStateVec3 = (value: unknown): Vec3 | null =>
  coerceVec3(value);

export const toSceneStateCartographicRad = (
  value: unknown
): LatLngAlt.rad | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    longitude?: unknown;
    latitude?: unknown;
    altitude?: unknown;
    height?: unknown;
  };
  const altitudeValue = candidate.altitude ?? candidate.height;
  if (
    !isFiniteNumber(candidate.longitude) ||
    !isFiniteNumber(candidate.latitude) ||
    !isFiniteNumber(altitudeValue)
  ) {
    return null;
  }

  return {
    longitude: candidate.longitude as LatLngAlt.rad["longitude"],
    latitude: candidate.latitude as LatLngAlt.rad["latitude"],
    altitude: altitudeValue as NonNullable<LatLngAlt.rad["altitude"]>,
  };
};

export const toSceneStateMat4 = (value: unknown): Mat4 | null => {
  return coerceMat4(value);
};

export const toSceneStateQuat = (value: unknown): Quat | null =>
  coerceQuat(value);
