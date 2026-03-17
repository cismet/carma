import type { CssPixels, Radians } from "@carma/units/types";
import { Camera, Matrix4, PerspectiveFrustum } from "../../cesium";
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
    state.matrixWorld = Matrix4.clone(camera.inverseViewMatrix, new Matrix4());
    state.matrixWorldInverse = Matrix4.clone(camera.viewMatrix, new Matrix4());

    const frustum = camera.frustum as
      | {
          projectionMatrix?: Matrix4;
          aspect?: number;
          aspectRatio?: number;
          near?: number;
          nearPlane?: number;
          far?: number;
          farPlane?: number;
          zoom?: number;
          focus?: number;
          filmGauge?: number;
          filmOffset?: number;
          viewOffset?: {
            enabled?: boolean;
            fullWidthPx: number;
            fullHeightPx: number;
            offsetXPx: number;
            offsetYPx: number;
            widthPx: number;
            heightPx: number;
          };
          width?: number;
          fov?: number;
        }
      | undefined;

    if (frustum?.projectionMatrix) {
      state.projectionMatrix = Matrix4.clone(
        frustum.projectionMatrix,
        new Matrix4()
      );
      state.projectionMatrixInverse = Matrix4.inverse(
        frustum.projectionMatrix,
        new Matrix4()
      );
    }

    state.type =
      camera.frustum instanceof PerspectiveFrustum
        ? "PerspectiveCamera"
        : Number.isFinite(frustum?.width) ||
          (!Number.isFinite(frustum?.fov) &&
            Number.isFinite((frustum as { left?: number } | undefined)?.left) &&
            Number.isFinite((frustum as { right?: number } | undefined)?.right))
        ? "OrthographicCamera"
        : undefined;
    state.aspect =
      (Number.isFinite(frustum?.aspect) ? frustum?.aspect : undefined) ??
      (Number.isFinite(frustum?.aspectRatio)
        ? frustum?.aspectRatio
        : undefined);
    state.near =
      (Number.isFinite(frustum?.near) ? frustum?.near : undefined) ??
      (Number.isFinite(frustum?.nearPlane) ? frustum?.nearPlane : undefined);
    state.far =
      (Number.isFinite(frustum?.far) ? frustum?.far : undefined) ??
      (Number.isFinite(frustum?.farPlane) ? frustum?.farPlane : undefined);
    if (frustum) {
      state.zoom = Number.isFinite(frustum.zoom) ? frustum.zoom : undefined;
      state.focus = Number.isFinite(frustum.focus) ? frustum.focus : undefined;
      state.filmGauge = Number.isFinite(frustum.filmGauge)
        ? frustum.filmGauge
        : undefined;
      state.filmOffset = Number.isFinite(frustum.filmOffset)
        ? frustum.filmOffset
        : undefined;
    }
    if (frustum?.viewOffset) {
      state.view = {
        enabled: frustum.viewOffset.enabled,
        fullWidth: frustum.viewOffset.fullWidthPx as CssPixels,
        fullHeight: frustum.viewOffset.fullHeightPx as CssPixels,
        offsetX: frustum.viewOffset.offsetXPx as CssPixels,
        offsetY: frustum.viewOffset.offsetYPx as CssPixels,
        width: frustum.viewOffset.widthPx as CssPixels,
        height: frustum.viewOffset.heightPx as CssPixels,
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
