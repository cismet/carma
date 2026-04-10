import {
  buildOrthographicScale,
  CAMERA_TYPE,
  readHorizontalFovFromVertical,
  type CameraIntrinsics,
} from "@carma-commons/camera/model";
import { isFiniteNumber } from "@carma-commons/math";

import {
  PerspectiveFrustum,
  OrthographicFrustum,
  OrthographicOffCenterFrustum,
} from "@carma-cesium";
import { readPerspectiveFrustumVerticalFov } from "./perspective-frustum-fov";
type SupportedCesiumFrustum =
  | PerspectiveFrustum
  | OrthographicFrustum
  | OrthographicOffCenterFrustum;

type SceneCameraIntrinsicsSource = {
  camera?: {
    frustum?: SupportedCesiumFrustum;
  };
  canvas?: {
    clientWidth?: number;
    clientHeight?: number;
  };
};

const readAspectRatio = (
  scene: SceneCameraIntrinsicsSource
): number | undefined => {
  const frustum = scene.camera?.frustum;
  const frustumAspect =
    frustum instanceof PerspectiveFrustum ||
    frustum instanceof OrthographicFrustum
      ? frustum.aspectRatio
      : undefined;
  if (isFiniteNumber(frustumAspect) && frustumAspect > 0) {
    return frustumAspect;
  }

  return undefined;
};

const readViewportDimension = (value: number | undefined): number | undefined =>
  isFiniteNumber(value) && value > 0 ? value : undefined;

const readSharedFrustum = (
  frustum: SupportedCesiumFrustum | undefined
): CameraIntrinsics["frustum"] | undefined => {
  const near = isFiniteNumber(frustum?.near) ? frustum.near : undefined;
  const far = isFiniteNumber(frustum?.far) ? frustum.far : undefined;

  return near !== undefined || far !== undefined
    ? ({
        ...(near !== undefined
          ? {
              near: near as NonNullable<CameraIntrinsics["frustum"]>["near"],
            }
          : {}),
        ...(far !== undefined
          ? {
              far: far as NonNullable<CameraIntrinsics["frustum"]>["far"],
            }
          : {}),
      } as NonNullable<CameraIntrinsics["frustum"]>)
    : undefined;
};

const readOrthographicMetersPerCssPixel = (
  scene: SceneCameraIntrinsicsSource,
  frustum: OrthographicFrustum | OrthographicOffCenterFrustum
) => {
  const viewportWidthPx = readViewportDimension(scene.canvas?.clientWidth);
  const viewportHeightPx = readViewportDimension(scene.canvas?.clientHeight);
  const horizontalMeters =
    frustum instanceof OrthographicFrustum
      ? frustum.width
      : isFiniteNumber(frustum.left) && isFiniteNumber(frustum.right)
      ? Math.abs(frustum.right - frustum.left)
      : undefined;
  const verticalMeters =
    frustum instanceof OrthographicFrustum
      ? isFiniteNumber(frustum.width) &&
        frustum.width > 0 &&
        isFiniteNumber(frustum.aspectRatio) &&
        frustum.aspectRatio > 0
        ? frustum.width / frustum.aspectRatio
        : undefined
      : isFiniteNumber(frustum.top) && isFiniteNumber(frustum.bottom)
      ? Math.abs(frustum.top - frustum.bottom)
      : undefined;

  const metersPerCssPixel =
    (isFiniteNumber(horizontalMeters) &&
    horizontalMeters > 0 &&
    viewportWidthPx !== undefined
      ? horizontalMeters / viewportWidthPx
      : undefined) ??
    (isFiniteNumber(verticalMeters) &&
    verticalMeters > 0 &&
    viewportHeightPx !== undefined
      ? verticalMeters / viewportHeightPx
      : undefined);

  return buildOrthographicScale(metersPerCssPixel ?? NaN);
};

export const readSceneCameraIntrinsics = (
  scene: SceneCameraIntrinsicsSource
): CameraIntrinsics => {
  const frustum = scene.camera?.frustum;
  const sharedFrustum = readSharedFrustum(frustum);

  if (
    frustum instanceof OrthographicFrustum ||
    frustum instanceof OrthographicOffCenterFrustum
  ) {
    // Cesium's orthographic off-center frustum is an asymmetric projection
    // volume, not the same thing as Three's setViewOffset-style sub-viewport.
    // The shared ViewState currently has no first-class carrier for that
    // asymmetry beyond a future projection-matrix-first lane, so the adapter
    // only preserves what is still semantically shared here: orthographic
    // scale plus near/far. It must not synthesize `viewOffset` from this.
    const orthographicScale = readOrthographicMetersPerCssPixel(scene, frustum);

    return {
      type: CAMERA_TYPE.ORTHOGRAPHIC,
      ...(orthographicScale ? { orthographicScale } : {}),
      ...(sharedFrustum ? { frustum: sharedFrustum } : {}),
    };
  }

  const fov =
    frustum instanceof PerspectiveFrustum
      ? readPerspectiveFrustumVerticalFov(frustum)
      : undefined;
  // Cesium does not expose a ViewState-compatible `viewOffset` concept.
  // Keep the field in shared intrinsics for other engines, but do not
  // synthesize it from canvas dimensions here. Cesium therefore leaves
  // `viewOffset` undefined rather than inventing placeholder values.
  // Likewise, Cesium off-center frusta are not equivalent to Three camera
  // view offsets. Those are asymmetric frusta, not sub-viewport metadata.
  // Important: this is not a missing convenience field that should later be
  // "restored" into Cesium. Cesium has no equivalent camera offset feature in
  // this sense, so feeding canvas dimensions back as `viewOffset` would imply
  // semantics that the engine does not actually support.
  const intrinsics: CameraIntrinsics = {
    type: CAMERA_TYPE.PERSPECTIVE,
    ...(fov ? { fov: fov as CameraIntrinsics["fov"] } : {}),
    ...(sharedFrustum ? { frustum: sharedFrustum } : {}),
  };
  const fovHorizontal = readHorizontalFovFromVertical(
    intrinsics.fov,
    readAspectRatio(scene)
  );

  return {
    ...intrinsics,
    ...(fovHorizontal
      ? { fovHorizontal: fovHorizontal as CameraIntrinsics["fovHorizontal"] }
      : {}),
  };
};
