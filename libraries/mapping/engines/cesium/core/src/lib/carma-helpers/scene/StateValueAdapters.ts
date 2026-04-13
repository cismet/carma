import type { Matrix4, Quaternion, Vector3 } from "three";

import type { LatLngAlt } from "@carma-geo/data-structures";
import {
  coerceMatrix4,
  coerceQuaternion,
  coerceVector3,
  isFiniteNumber,
} from "@carma-commons/math";
export const toSceneStateVec3 = (value: unknown): Vector3 | null =>
  coerceVector3(value);

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

export const toSceneStateMat4 = (value: unknown): Matrix4 | null =>
  coerceMatrix4(value);

export const toSceneStateQuat = (value: unknown): Quaternion | null =>
  coerceQuaternion(value);
