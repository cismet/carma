import {
  Cartesian3,
  CesiumMath,
  Matrix4,
  type PerspectiveFrustum,
  type Scene,
} from "@carma-cesium";

import { readPerspectiveFrustumVerticalFov } from "./perspective-frustum-fov";

export type CameraSnapshot = {
  position: Cartesian3;
  direction: Cartesian3;
  up: Cartesian3;
  right: Cartesian3;
  projectionMatrix: Matrix4 | null;
  frustumFovY: number;
};

const CAMERA_POSITION_EPSILON_METERS = 1e-4;
const CAMERA_DIRECTION_EPSILON = 1e-6;
const CAMERA_PROJECTION_MATRIX_EPSILON = 1e-6;
const CAMERA_SNAPSHOT_RELATIVE_EPSILON = 0;

type PerspectiveFovSource = Pick<
  PerspectiveFrustum,
  "aspectRatio" | "fov" | "fovy"
>;

export const getCameraSnapshot = (scene: Scene): CameraSnapshot => {
  const { camera } = scene;
  const { frustum } = camera;
  const projectionMatrix = frustum.projectionMatrix;

  // Cesium caches derived camera/frustum state. The WC camera vectors call
  // updateMembers(), while projectionMatrix/fovy recompute the frustum when
  // needed. Read those getters here, then clone them so later Cesium mutations
  // cannot change this snapshot.
  return {
    position: Cartesian3.clone(camera.positionWC),
    direction: Cartesian3.clone(camera.directionWC),
    up: Cartesian3.clone(camera.upWC),
    right: Cartesian3.clone(camera.rightWC),
    projectionMatrix: projectionMatrix
      ? Matrix4.clone(projectionMatrix, new Matrix4())
      : null,
    frustumFovY:
      readPerspectiveFrustumVerticalFov(frustum as PerspectiveFovSource) ?? 0,
  };
};

const areCameraSnapshotPositionsEqual = (
  left: CameraSnapshot,
  right: CameraSnapshot
): boolean =>
  Cartesian3.equalsEpsilon(
    left.position,
    right.position,
    CAMERA_SNAPSHOT_RELATIVE_EPSILON,
    CAMERA_POSITION_EPSILON_METERS
  );

const areCameraSnapshotPosesEqual = (
  left: CameraSnapshot,
  right: CameraSnapshot
): boolean =>
  Cartesian3.equalsEpsilon(
    left.direction,
    right.direction,
    CAMERA_SNAPSHOT_RELATIVE_EPSILON,
    CAMERA_DIRECTION_EPSILON
  ) &&
  Cartesian3.equalsEpsilon(
    left.up,
    right.up,
    CAMERA_SNAPSHOT_RELATIVE_EPSILON,
    CAMERA_DIRECTION_EPSILON
  ) &&
  Cartesian3.equalsEpsilon(
    left.right,
    right.right,
    CAMERA_SNAPSHOT_RELATIVE_EPSILON,
    CAMERA_DIRECTION_EPSILON
  );

const areCameraSnapshotProjectionMatricesEqual = (
  left: CameraSnapshot,
  right: CameraSnapshot
): boolean => {
  if (left.projectionMatrix && right.projectionMatrix) {
    return Matrix4.equalsEpsilon(
      left.projectionMatrix,
      right.projectionMatrix,
      CAMERA_PROJECTION_MATRIX_EPSILON
    );
  }

  if (left.projectionMatrix || right.projectionMatrix) {
    return false;
  }

  return CesiumMath.equalsEpsilon(
    left.frustumFovY,
    right.frustumFovY,
    CAMERA_SNAPSHOT_RELATIVE_EPSILON,
    CAMERA_PROJECTION_MATRIX_EPSILON
  );
};

export const areCameraSnapshotsEqual = (
  left: CameraSnapshot | null,
  right: CameraSnapshot | null
): boolean => {
  if (!left && !right) return true;
  if (!left || !right) return false;

  return (
    areCameraSnapshotPositionsEqual(left, right) &&
    areCameraSnapshotPosesEqual(left, right) &&
    areCameraSnapshotProjectionMatricesEqual(left, right)
  );
};
