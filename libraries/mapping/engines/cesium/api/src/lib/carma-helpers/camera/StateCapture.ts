import { Quaternion, Vector3 } from "three";

import type { Radians } from "@carma/units/types";

import {
  toSceneStateMat4,
  toSceneStateVec3,
} from "../scene/StateValueAdapters";
import {
  Camera,
  Matrix4,
  OrthographicFrustum,
  OrthographicOffCenterFrustum,
  PerspectiveFrustum,
} from "../../cesium";
import { readPerspectiveFrustumVerticalFov } from "./PerspectiveFrustumFov";
import { cameraPositionCartographicRadians } from "./Position";
import type {
  CaptureCurrentCameraStateOptions,
  CapturedCameraState,
} from "./Types";
type CameraWorldBasisSource = Pick<
  Camera,
  "directionWC" | "upWC" | "rightWC" | "inverseViewMatrix"
>;

export const readCameraWorldBasis = (
  camera: CameraWorldBasisSource
): { forward: Vector3; right: Vector3; up: Vector3 } => {
  const direction = toSceneStateVec3(camera.directionWC);
  const up = toSceneStateVec3(camera.upWC);
  const right = toSceneStateVec3(camera.rightWC);

  if (direction && up) {
    const forward = direction.clone().normalize();
    const orthRight =
      right?.clone().normalize() ??
      new Vector3().crossVectors(forward, up).normalize();
    const orthUp = new Vector3().crossVectors(orthRight, forward).normalize();

    return {
      forward,
      right: orthRight,
      up: orthUp,
    };
  }

  const matrixWorld = toSceneStateMat4(camera.inverseViewMatrix);
  if (matrixWorld) {
    const orientation = new Quaternion().setFromRotationMatrix(matrixWorld);
    const forward = new Vector3(0, 0, -1).applyQuaternion(orientation);
    const localRight = new Vector3(1, 0, 0).applyQuaternion(orientation);
    const localUp = new Vector3(0, 1, 0).applyQuaternion(orientation);
    return {
      forward: forward.normalize(),
      right: localRight.normalize(),
      up: localUp.normalize(),
    };
  }

  return {
    forward: new Vector3(0, 0, -1),
    right: new Vector3(1, 0, 0),
    up: new Vector3(0, 1, 0),
  };
};

const resolveCaptureOptions = (
  includeFovOrOptions: boolean | CaptureCurrentCameraStateOptions
): Required<CaptureCurrentCameraStateOptions> => {
  if (typeof includeFovOrOptions === "boolean") {
    return {
      includeFov: includeFovOrOptions,
      includeOrientation: true,
      includeCartographic: true,
      includeMatrices: true,
    };
  }

  return {
    includeFov: includeFovOrOptions.includeFov ?? true,
    includeOrientation: includeFovOrOptions.includeOrientation ?? true,
    includeCartographic: includeFovOrOptions.includeCartographic ?? true,
    includeMatrices: includeFovOrOptions.includeMatrices ?? true,
  };
};

/**
 * Capture the current camera state in world coordinates (latest render state).
 */
export const captureCurrentCameraState = (
  camera: Camera,
  includeFovOrOptions: boolean | CaptureCurrentCameraStateOptions = true
): CapturedCameraState => {
  const {
    includeFov,
    includeOrientation,
    includeCartographic,
    includeMatrices,
  } = resolveCaptureOptions(includeFovOrOptions);

  const state: CapturedCameraState = {
    // WC getters call Cesium updateMembers internally and keep values frame-consistent.
    position: camera.positionWC.clone(),
    direction: camera.directionWC.clone(),
    up: camera.upWC.clone(),
    right: camera.rightWC.clone(),
  };

  if (includeOrientation) {
    if (Number.isFinite(camera.heading)) {
      state.heading = camera.heading as Radians;
    }
    if (Number.isFinite(camera.pitch)) {
      state.pitch = camera.pitch as Radians;
    }
    if (Number.isFinite(camera.roll)) {
      state.roll = camera.roll as Radians;
    }
  }

  if (includeCartographic) {
    state.cartographic = cameraPositionCartographicRadians(camera);
  }

  if (includeMatrices) {
    state.viewMatrix = Matrix4.clone(camera.viewMatrix, new Matrix4());
    state.inverseViewMatrix = Matrix4.clone(
      camera.inverseViewMatrix,
      new Matrix4()
    );
    const frustum = camera.frustum;

    if (frustum instanceof PerspectiveFrustum) {
      state.frustum = {
        type: "PerspectiveFrustum",
        ...(frustum.projectionMatrix
          ? {
              projectionMatrix: Matrix4.clone(
                frustum.projectionMatrix,
                new Matrix4()
              ),
            }
          : {}),
        ...(Number.isFinite(frustum.fov) ? { fov: frustum.fov } : {}),
        ...(Number.isFinite(frustum.fovy) ? { fovy: frustum.fovy } : {}),
        ...(Number.isFinite(frustum.aspectRatio)
          ? { aspectRatio: frustum.aspectRatio }
          : {}),
        ...(Number.isFinite(frustum.near) ? { near: frustum.near } : {}),
        ...(Number.isFinite(frustum.far) ? { far: frustum.far } : {}),
      };
    } else if (frustum instanceof OrthographicFrustum) {
      state.frustum = {
        type: "OrthographicFrustum",
        ...(frustum.projectionMatrix
          ? {
              projectionMatrix: Matrix4.clone(
                frustum.projectionMatrix,
                new Matrix4()
              ),
            }
          : {}),
        ...(Number.isFinite(frustum.width) ? { width: frustum.width } : {}),
        ...(Number.isFinite(frustum.aspectRatio)
          ? { aspectRatio: frustum.aspectRatio }
          : {}),
        ...(Number.isFinite(frustum.near) ? { near: frustum.near } : {}),
        ...(Number.isFinite(frustum.far) ? { far: frustum.far } : {}),
      };
    } else if (frustum instanceof OrthographicOffCenterFrustum) {
      state.frustum = {
        type: "OrthographicOffCenterFrustum",
        ...(frustum.projectionMatrix
          ? {
              projectionMatrix: Matrix4.clone(
                frustum.projectionMatrix,
                new Matrix4()
              ),
            }
          : {}),
        ...(Number.isFinite(frustum.left) ? { left: frustum.left } : {}),
        ...(Number.isFinite(frustum.right) ? { right: frustum.right } : {}),
        ...(Number.isFinite(frustum.top) ? { top: frustum.top } : {}),
        ...(Number.isFinite(frustum.bottom) ? { bottom: frustum.bottom } : {}),
        ...(Number.isFinite(frustum.near) ? { near: frustum.near } : {}),
        ...(Number.isFinite(frustum.far) ? { far: frustum.far } : {}),
      };
    }
  }

  if (
    includeFov &&
    camera.frustum instanceof PerspectiveFrustum &&
    readPerspectiveFrustumVerticalFov(camera.frustum) !== undefined
  ) {
    state.fov = readPerspectiveFrustumVerticalFov(camera.frustum);
  }

  return state;
};
