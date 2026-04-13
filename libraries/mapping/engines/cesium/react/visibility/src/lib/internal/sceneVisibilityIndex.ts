import { Cartesian3, type Scene } from "@carma-cesium";

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

export type CameraSnapshot = {
  position: Cartesian3;
  direction: Cartesian3;
  up: Cartesian3;
  right: Cartesian3;
  frustumNear: number;
  frustumFar: number;
  frustumFovY: number;
  frustumLeft: number;
  frustumRight: number;
  frustumTop: number;
  frustumBottom: number;
};

export const DEFAULT_VIEWPORT_PADDING_HORIZONTAL = 100;
export const DEFAULT_VIEWPORT_PADDING_VERTICAL = 50;
export const DEFAULT_OCCLUSION_TOLERANCE_METERS = 1.0;

const CAMERA_POSITION_EPSILON_METERS = 1e-4;
const CAMERA_DIRECTION_EPSILON = 1e-6;
const CAMERA_FRUSTUM_EPSILON = 1e-6;
const POSITION_KEY_PRECISION = 1000; // millimeter precision in ECEF meters

const toRoundedInteger = (value: number) =>
  Number.isFinite(value) ? Math.round(value * POSITION_KEY_PRECISION) : 0;

const toFiniteNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

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

export const getCameraSnapshot = (scene: Scene): CameraSnapshot => {
  const frustum = scene.camera.frustum as unknown as {
    near?: number;
    far?: number;
    fovy?: number;
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
  };

  return {
    position: Cartesian3.clone(scene.camera.positionWC),
    direction: Cartesian3.clone(scene.camera.directionWC),
    up: Cartesian3.clone(scene.camera.upWC),
    right: Cartesian3.clone(scene.camera.rightWC),
    frustumNear: toFiniteNumber(frustum.near),
    frustumFar: toFiniteNumber(frustum.far),
    frustumFovY: toFiniteNumber(frustum.fovy),
    frustumLeft: toFiniteNumber(frustum.left),
    frustumRight: toFiniteNumber(frustum.right),
    frustumTop: toFiniteNumber(frustum.top),
    frustumBottom: toFiniteNumber(frustum.bottom),
  };
};

export const areCameraSnapshotsEqual = (
  left: CameraSnapshot | null,
  right: CameraSnapshot | null
) => {
  if (!left && !right) return true;
  if (!left || !right) return false;

  return (
    Cartesian3.distance(left.position, right.position) <=
      CAMERA_POSITION_EPSILON_METERS &&
    Cartesian3.distance(left.direction, right.direction) <=
      CAMERA_DIRECTION_EPSILON &&
    Cartesian3.distance(left.up, right.up) <= CAMERA_DIRECTION_EPSILON &&
    Cartesian3.distance(left.right, right.right) <= CAMERA_DIRECTION_EPSILON &&
    Math.abs(left.frustumNear - right.frustumNear) <= CAMERA_FRUSTUM_EPSILON &&
    Math.abs(left.frustumFar - right.frustumFar) <= CAMERA_FRUSTUM_EPSILON &&
    Math.abs(left.frustumFovY - right.frustumFovY) <= CAMERA_FRUSTUM_EPSILON &&
    Math.abs(left.frustumLeft - right.frustumLeft) <= CAMERA_FRUSTUM_EPSILON &&
    Math.abs(left.frustumRight - right.frustumRight) <=
      CAMERA_FRUSTUM_EPSILON &&
    Math.abs(left.frustumTop - right.frustumTop) <= CAMERA_FRUSTUM_EPSILON &&
    Math.abs(left.frustumBottom - right.frustumBottom) <= CAMERA_FRUSTUM_EPSILON
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
