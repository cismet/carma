import { Matrix4, Quaternion, Vector3, isFiniteNumber } from "@carma/math";
import type { Meters, Radians } from "@carma/units/types";
import { ecefToEnuMatrix } from "@carma/geo/utils";
import {
  buildOrientationQuaternionFromLocalCameraBasis,
  enuDirectionToLocalYUpSceneDirection,
  localYUpSceneDirectionToEnuDirection,
  readHorizontalFovFromVertical,
  readLocalCameraBasis,
  readViewOffsetFromElement,
  type CameraIntrinsics,
} from "@carma-commons/camera/model";
import {
  Cartesian2,
  Cartesian3,
  type CameraStateRecord,
  Matrix4 as CesiumMatrix4,
  readPerspectiveFrustumVerticalFov,
  setViewFromCameraState,
  writePerspectiveFrustumVerticalFov,
  toSceneStateVec3,
  toSceneStateMat4,
  type CameraLike,
  type SceneLike,
} from "@carma-mapping/engines/cesium/api";
import { PerspectiveFrustum } from "@carma/cesium";
import {
  buildViewStateFromEcef,
  type AngleBasedViewInput,
} from "../core/construct";
import type { ViewState, ViewStateMetadata } from "../core/types";

// ---------------------------------------------------------------------------
// Cesium-specific orbit point sampling
// ---------------------------------------------------------------------------

const sampleOrbitAnchor = (
  scene: SceneLike,
  camera: CameraLike
): Vector3 | null => {
  const canvas = scene.canvas;
  if (!canvas) return null;

  const cx = canvas.clientWidth * 0.5;
  const cy = canvas.clientHeight * 0.5;
  const screenCenter = new Cartesian2(cx, cy);

  if (
    scene.pickPositionSupported !== false &&
    typeof scene.pickPosition === "function"
  ) {
    const picked = scene.pickPosition(screenCenter);
    const v = toSceneStateVec3(picked);
    if (v) return v;
  }

  if (
    typeof camera.getPickRay === "function" &&
    typeof scene.globe?.pick === "function"
  ) {
    const ray = camera.getPickRay(screenCenter);
    if (ray) {
      const globeHit = scene.globe.pick(ray, scene);
      const v = toSceneStateVec3(globeHit);
      if (v) return v;
    }
  }

  return null;
};

const readCameraWorldBasis = (
  camera: CameraLike
): { forward: Vector3; right: Vector3; up: Vector3 } => {
  const direction = toSceneStateVec3(camera.directionWC);
  const up = toSceneStateVec3(camera.upWC);
  const right = toSceneStateVec3(
    (camera as CameraLike & { rightWC?: unknown }).rightWC
  );

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

const worldVectorToLocalSceneVector = ({
  worldVector,
  anchor,
}: {
  worldVector: Vector3;
  anchor: Vector3;
}): Vector3 => {
  const enuVector = worldVector
    .clone()
    .transformDirection(ecefToEnuMatrix(anchor, _ecefToEnuScratch));
  return enuDirectionToLocalYUpSceneDirection(enuVector);
};

const readLocalOrientation = ({
  camera,
  anchor,
}: {
  camera: CameraLike;
  anchor: Vector3;
}): Quaternion => {
  const worldBasis = readCameraWorldBasis(camera);
  const localBasis = {
    forward: worldVectorToLocalSceneVector({
      worldVector: worldBasis.forward,
      anchor,
    }),
    right: worldVectorToLocalSceneVector({
      worldVector: worldBasis.right,
      anchor,
    }),
    up: worldVectorToLocalSceneVector({
      worldVector: worldBasis.up,
      anchor,
    }),
  };

  const right = localBasis.right.clone().normalize();
  const up = new Vector3().crossVectors(right, localBasis.forward).normalize();
  const forward = new Vector3().crossVectors(up, right).normalize();

  return buildOrientationQuaternionFromLocalCameraBasis({
    forward,
    right,
    up,
  });
};

const readAspectRatio = (
  camera: CameraLike,
  viewOffset?: CameraIntrinsics["viewOffset"]
): number | undefined => {
  const frustumAspect = camera.frustum?.aspectRatio;
  if (isFiniteNumber(frustumAspect) && frustumAspect > 0) {
    return frustumAspect;
  }

  return isFiniteNumber(viewOffset?.width) &&
    isFiniteNumber(viewOffset?.height) &&
    viewOffset.height > 0
    ? viewOffset.width / viewOffset.height
    : undefined;
};

const readIntrinsics = (
  camera: CameraLike,
  scene: SceneLike
): CameraIntrinsics => {
  const fov = readPerspectiveFrustumVerticalFov(
    camera.frustum as Parameters<typeof readPerspectiveFrustumVerticalFov>[0]
  ) as Radians | undefined;
  const frustum = camera.frustum;
  const viewOffset = readViewOffsetFromElement(scene.canvas);
  const aspect = readAspectRatio(camera, viewOffset);
  const fovHorizontal = readHorizontalFovFromVertical(fov, aspect);
  return {
    ...(fov ? { fov } : {}),
    ...(fovHorizontal ? { fovHorizontal } : {}),
    ...(viewOffset ? { viewOffset } : {}),
    ...(frustum && isFiniteNumber(frustum.near)
      ? { frustum: { near: frustum.near as Meters } }
      : {}),
    ...(frustum && isFiniteNumber(frustum.far)
      ? {
          frustum: {
            ...(frustum.near ? { near: frustum.near as Meters } : {}),
            far: frustum.far as Meters,
          },
        }
      : {}),
  };
};

// ---------------------------------------------------------------------------
// Read: Cesium scene → ViewState
// ---------------------------------------------------------------------------

export const readFromCesium = (
  scene: SceneLike,
  sourceId: string
): ViewState | null => {
  try {
    const camera = scene.camera as CameraLike | undefined;
    if (!camera) return null;

    const cameraEcef =
      toSceneStateVec3(camera.positionWC) ?? toSceneStateVec3(camera.position);
    if (!cameraEcef) return null;

    const anchor = sampleOrbitAnchor(scene, camera);
    if (!anchor) return null;

    const orientation = readLocalOrientation({
      camera,
      anchor,
    });

    const intrinsics = readIntrinsics(camera, scene);
    const frameNumber = (scene as { frameState?: { frameNumber?: number } })
      .frameState?.frameNumber;

    const metadata: ViewStateMetadata = {
      frameId: isFiniteNumber(frameNumber) ? frameNumber : 0,
      timestampMs: Date.now(),
      sourceId,
      source: "user-interaction",
    };

    return buildViewStateFromEcef({
      anchor,
      cameraPosition: cameraEcef,
      orientation,
      intrinsics,
      metadata,
    });
  } catch {
    return null;
  }
};

const _ecefToEnuScratch = new Matrix4();
const _enuToEcefScratch = new Matrix4();

const localSceneVectorToWorldVector = ({
  localVector,
  anchor,
}: {
  localVector: Vector3;
  anchor: Vector3;
}): Vector3 => {
  const enuVector = localYUpSceneDirectionToEnuDirection(localVector);
  const enuToEcef = _enuToEcefScratch
    .copy(ecefToEnuMatrix(anchor, _ecefToEnuScratch))
    .invert();

  return enuVector.transformDirection(enuToEcef).normalize();
};

const toCesiumCartesian3 = (value: Vector3): Cartesian3 =>
  new Cartesian3(value.x, value.y, value.z);

// ---------------------------------------------------------------------------
// Apply: ViewState → Cesium scene
// ---------------------------------------------------------------------------

export type CesiumCameraStateFromViewState = CameraStateRecord;

export const readCesiumCameraStateFromViewState = (
  state: ViewState
): CesiumCameraStateFromViewState => {
  const basis = readLocalCameraBasis(state.orientation);
  const direction = localSceneVectorToWorldVector({
    localVector: basis.forward,
    anchor: state.anchor,
  });
  const up = localSceneVectorToWorldVector({
    localVector: basis.up,
    anchor: state.anchor,
  });
  const right = localSceneVectorToWorldVector({
    localVector: basis.right,
    anchor: state.anchor,
  });

  return {
    position: toCesiumCartesian3(state.cameraPosition),
    direction: toCesiumCartesian3(direction),
    up: toCesiumCartesian3(up),
    right: toCesiumCartesian3(right),
    ...(Number.isFinite(state.intrinsics.fov)
      ? { fov: state.intrinsics.fov as number }
      : {}),
  };
};

export const applyToCesium = (scene: SceneLike, state: ViewState): void => {
  const camera = scene.camera as unknown as Parameters<
    typeof setViewFromCameraState
  >[0];
  const cameraState = readCesiumCameraStateFromViewState(state);

  camera.lookAtTransform(CesiumMatrix4.IDENTITY);
  setViewFromCameraState(camera, cameraState);

  (scene as SceneLike & { requestRender?: () => void }).requestRender?.();
};

export const flyToCesium = (
  scene: SceneLike,
  state: ViewState,
  options: { duration?: number } = {}
): void => {
  const camera = scene.camera as unknown as Parameters<
    typeof setViewFromCameraState
  >[0] & {
    flyTo?: (options: {
      destination: Cartesian3;
      orientation: {
        direction: Cartesian3;
        up: Cartesian3;
      };
      duration?: number;
    }) => void;
  };
  const cameraState = readCesiumCameraStateFromViewState(state);

  camera.lookAtTransform(CesiumMatrix4.IDENTITY);

  if (typeof camera.flyTo === "function") {
    camera.flyTo({
      destination: cameraState.position,
      orientation: {
        direction: cameraState.direction,
        up: cameraState.up,
      },
      duration: options.duration,
    });
  } else {
    setViewFromCameraState(camera, cameraState);
  }

  if (
    Number.isFinite(cameraState.fov) &&
    camera.frustum instanceof PerspectiveFrustum
  ) {
    writePerspectiveFrustumVerticalFov(camera.frustum, cameraState.fov);
  }

  (scene as SceneLike & { requestRender?: () => void }).requestRender?.();
};
