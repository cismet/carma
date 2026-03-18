import type { Radians } from "@carma/units/types";
import {
  Camera,
  Matrix4,
  OrthographicFrustum,
  OrthographicOffCenterFrustum,
  PerspectiveFrustum,
} from "../../cesium";
import { cameraPositionCartographicRadians } from "./CameraPosition";
import type {
  CaptureCurrentCameraStateOptions,
  CapturedCameraState,
} from "./CameraTypes";

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
    camera.frustum.fov !== undefined
  ) {
    state.fov = camera.frustum.fov;
  }

  return state;
};
