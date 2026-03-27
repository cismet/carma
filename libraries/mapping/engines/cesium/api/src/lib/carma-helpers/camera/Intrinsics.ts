import {
  CAMERA_TYPE,
  readHorizontalFovFromVertical,
  type CameraIntrinsics,
} from "@carma-commons/camera/model";
import { isFiniteNumber } from "@carma/math";
import type { Matrix4 } from "../../cesium";
import { readPerspectiveFrustumVerticalFov } from "./PerspectiveFrustumFov";

type FrustumLike = {
  fov?: number;
  fovy?: number;
  aspectRatio?: number;
  near?: number;
  far?: number;
  projectionMatrix?: Matrix4;
};

type SceneCameraIntrinsicsSource = {
  camera?: {
    frustum?: FrustumLike;
  };
};

const readAspectRatio = (
  scene: SceneCameraIntrinsicsSource
): number | undefined => {
  const frustumAspect = scene.camera?.frustum?.aspectRatio;
  if (isFiniteNumber(frustumAspect) && frustumAspect > 0) {
    return frustumAspect;
  }

  return undefined;
};

export const readSceneCameraIntrinsics = (
  scene: SceneCameraIntrinsicsSource
): CameraIntrinsics => {
  const fov = readPerspectiveFrustumVerticalFov(
    scene.camera?.frustum as Parameters<
      typeof readPerspectiveFrustumVerticalFov
    >[0]
  );
  // Cesium does not expose a ViewState-compatible `viewOffset` concept.
  // Keep the field in shared intrinsics for other engines, but do not
  // synthesize it from canvas dimensions here. Cesium therefore leaves
  // `viewOffset` undefined rather than inventing placeholder values.
  // Important: this is not a missing convenience field that should later be
  // "restored" into Cesium. Cesium has no equivalent camera offset feature in
  // this sense, so feeding canvas dimensions back as `viewOffset` would imply
  // semantics that the engine does not actually support.
  const intrinsics: CameraIntrinsics = {
    type: CAMERA_TYPE.PERSPECTIVE,
    ...(fov ? { fov: fov as CameraIntrinsics["fov"] } : {}),
    ...(isFiniteNumber(scene.camera?.frustum?.near)
      ? {
          frustum: {
            near: scene.camera.frustum.near as NonNullable<
              CameraIntrinsics["frustum"]
            >["near"],
          },
        }
      : {}),
    ...(isFiniteNumber(scene.camera?.frustum?.far)
      ? {
          frustum: {
            ...(isFiniteNumber(scene.camera?.frustum?.near)
              ? {
                  near: scene.camera.frustum.near as NonNullable<
                    CameraIntrinsics["frustum"]
                  >["near"],
                }
              : {}),
            far: scene.camera.frustum.far as NonNullable<
              CameraIntrinsics["frustum"]
            >["far"],
          },
        }
      : {}),
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
