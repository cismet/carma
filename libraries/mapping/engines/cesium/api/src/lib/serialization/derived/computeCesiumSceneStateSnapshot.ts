import type {
  CameraLike,
  SceneCameraSnapshot,
  SceneLike,
  SceneStateOptions,
  SceneStateSnapshot,
} from "@carma/types";
import { isFiniteNumber } from "@carma/math";
import { Cartesian3 } from "../../cesium";
import {
  captureCurrentCameraState,
  isValidCamera,
  type CapturedCameraState,
} from "../../carma-helpers/camera";
import { resolveSceneStateOrbitPoint } from "../../carma-helpers/scene-state/SceneStateOrbitPoint";
import {
  toSceneStateCartographicRad,
  toSceneStateMat4,
  toSceneStateVec3,
} from "../../carma-helpers/scene-state/SceneStateValueAdapters";

const DEFAULT_FALLBACK_HEIGHT_M = 200;

const buildSceneCameraSnapshotFromCapturedState = (
  capturedState: Pick<
    CapturedCameraState,
    | "position"
    | "cartographic"
    | "heading"
    | "pitch"
    | "roll"
    | "fov"
    | "viewMatrix"
    | "inverseViewMatrix"
  >
): SceneCameraSnapshot | null => {
  const worldPosition = toSceneStateVec3(capturedState.position);
  if (!worldPosition) return null;

  const viewMatrix = toSceneStateMat4(capturedState.viewMatrix);
  const inverseViewMatrix = toSceneStateMat4(capturedState.inverseViewMatrix);

  return {
    worldPosition,
    cartographic: toSceneStateCartographicRad(capturedState.cartographic),
    ...(isFiniteNumber(capturedState.heading)
      ? { headingRad: capturedState.heading }
      : {}),
    ...(isFiniteNumber(capturedState.pitch)
      ? { pitchRad: capturedState.pitch }
      : {}),
    ...(isFiniteNumber(capturedState.roll) ? { rollRad: capturedState.roll } : {}),
    ...(isFiniteNumber(capturedState.fov) ? { fovRad: capturedState.fov } : {}),
    ...(viewMatrix ? { viewMatrix } : {}),
    ...(inverseViewMatrix ? { inverseViewMatrix } : {}),
  };
};

const readFallbackCameraSnapshot = (
  scene: SceneLike,
  camera: CameraLike
): SceneCameraSnapshot | null => {
  const worldPosition = toSceneStateVec3(camera.positionWC) ?? toSceneStateVec3(camera.position);
  if (!worldPosition) return null;

  const cartographic =
    toSceneStateCartographicRad(camera.positionCartographic) ??
    toSceneStateCartographicRad(
      scene.globe?.ellipsoid?.cartesianToCartographic?.(
        new Cartesian3(worldPosition.x, worldPosition.y, worldPosition.z)
      ) ?? null
    );
  const viewMatrix = toSceneStateMat4(camera.viewMatrix);
  const inverseViewMatrix = toSceneStateMat4(camera.inverseViewMatrix);
  const frustumFov =
    camera.frustum && typeof camera.frustum === "object" && isFiniteNumber(camera.frustum.fov)
      ? camera.frustum.fov
      : undefined;

  return {
    worldPosition,
    cartographic,
    ...(isFiniteNumber(camera.heading) ? { headingRad: camera.heading } : {}),
    ...(isFiniteNumber(camera.pitch) ? { pitchRad: camera.pitch } : {}),
    ...(isFiniteNumber(camera.roll) ? { rollRad: camera.roll } : {}),
    ...(isFiniteNumber(frustumFov) ? { fovRad: frustumFov } : {}),
    ...(viewMatrix ? { viewMatrix } : {}),
    ...(inverseViewMatrix ? { inverseViewMatrix } : {}),
  };
};

export const computeCesiumSceneStateSnapshot = (
  scene: SceneLike,
  {
    orbitPointMode = "screen-center",
    fallbackHeightM = DEFAULT_FALLBACK_HEIGHT_M,
    screenCenterSamplingStrategy = "depth-first",
    throwOnMissingScreenCenterIntersection = false,
  }: SceneStateOptions = {},
  metadata: {
    frameNumber: number | null;
    timestampMs: number;
  }
): SceneStateSnapshot | null => {
  const camera = scene.camera as CameraLike | undefined;
  if (!camera) {
    return null;
  }

  const cameraSnapshot = isValidCamera(camera)
    ? buildSceneCameraSnapshotFromCapturedState(
        captureCurrentCameraState(camera, {
          includeFov: true,
          includeOrientation: true,
          includeCartographic: true,
          includeMatrices: true,
        })
      )
    : readFallbackCameraSnapshot(scene, camera);
  if (!cameraSnapshot) {
    return null;
  }

  const orbitPoint = resolveSceneStateOrbitPoint(scene, camera, {
    cameraWorldPosition: cameraSnapshot.worldPosition,
    cameraCartographic: cameraSnapshot.cartographic,
    orbitPointMode,
    fallbackHeightM,
    screenCenterSamplingStrategy,
    throwOnMissingScreenCenterIntersection,
  });

  return {
    frameNumber: metadata.frameNumber,
    timestampMs: metadata.timestampMs,
    camera: cameraSnapshot,
    orbitPoint,
  };
};
