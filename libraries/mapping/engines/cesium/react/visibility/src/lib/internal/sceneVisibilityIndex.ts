import { Cartesian3 } from "@carma-cesium";
export {
  areCameraSnapshotsEqual,
  getCameraSnapshot,
  type CameraSnapshot,
} from "@carma-mapping/engines/cesium/core";

export type VisibilityScreenPosition = { x: number; y: number } | null;

export type SceneVisibilityStateLike = {
  isHidden: boolean;
  isOccluded: boolean;
  screenPosition: VisibilityScreenPosition;
};

export type PointEntry = {
  key: string;
  positionECEF: Cartesian3;
};

export type RegisteredPoint = {
  id: string;
  key: string;
  positionECEF: Cartesian3;
};

export type VisibilityRegistry = {
  registrationsById: Record<string, RegisteredPoint>;
  pointsByKey: Record<string, PointEntry>;
};

export const DEFAULT_VIEWPORT_PADDING_HORIZONTAL = 100;
export const DEFAULT_VIEWPORT_PADDING_VERTICAL = 50;
export const DEFAULT_OCCLUSION_TOLERANCE_METERS = 1.0;

const POSITION_KEY_PRECISION = 1000; // millimeter precision in ECEF meters

const toRoundedInteger = (value: number) =>
  Number.isFinite(value) ? Math.round(value * POSITION_KEY_PRECISION) : 0;

export const isSamePointPosition = (left: Cartesian3, right: Cartesian3) =>
  left.x === right.x && left.y === right.y && left.z === right.z;

export const getPositionKey = (position: Cartesian3) =>
  `${toRoundedInteger(position.x)}|${toRoundedInteger(
    position.y
  )}|${toRoundedInteger(position.z)}`;

export const areVisibilityStatesEqual = (
  left: SceneVisibilityStateLike | undefined,
  right: SceneVisibilityStateLike | undefined
) => {
  if (!left && !right) return true;
  if (!left || !right) return false;
  if (left.isHidden !== right.isHidden) return false;
  if (left.isOccluded !== right.isOccluded) return false;
  if (!left.screenPosition && !right.screenPosition) return true;
  if (!left.screenPosition || !right.screenPosition) return false;
  return (
    left.screenPosition.x === right.screenPosition.x &&
    left.screenPosition.y === right.screenPosition.y
  );
};

export const buildPointsByKeyFromRegistrations = (
  registrationsById: Record<string, RegisteredPoint>
) => {
  const pointsByKey: Record<string, PointEntry> = {};
  Object.values(registrationsById).forEach((registration) => {
    if (!pointsByKey[registration.key]) {
      pointsByKey[registration.key] = {
        key: registration.key,
        positionECEF: Cartesian3.clone(registration.positionECEF),
      };
    }
  });
  return pointsByKey;
};

export const getUniquePointKeysForIds = (
  ids: string[],
  registrationsById: Record<string, RegisteredPoint>
) =>
  Array.from(
    new Set(
      ids
        .map((id) => registrationsById[id]?.key)
        .filter((key): key is string => Boolean(key))
    )
  );

export const buildRegistrationIdSignature = (
  registrationsById: Record<string, RegisteredPoint>
) => Object.keys(registrationsById).sort().join("|");

export const buildRealtimeOcclusionSignature = (
  realtimeOcclusionPointIds: string[],
  registrationsById: Record<string, RegisteredPoint>
) => {
  if (realtimeOcclusionPointIds.length === 0) return "";
  const uniqueSortedIds = Array.from(new Set(realtimeOcclusionPointIds)).sort();
  return uniqueSortedIds
    .map((id) => {
      const registration = registrationsById[id];
      if (!registration) return `${id}:missing`;
      const position = registration.positionECEF;
      return `${id}:${position.x}:${position.y}:${position.z}`;
    })
    .join("|");
};
