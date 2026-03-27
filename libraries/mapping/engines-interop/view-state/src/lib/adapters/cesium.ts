import { isFiniteNumber } from "@carma/math";
import {
  buildOrientationQuaternionFromWorldCameraBasisAtAnchor,
  localYUpSceneDirectionToWorldDirectionAtAnchor,
  readLocalCameraBasis,
} from "@carma-commons/camera/model";
import {
  Cartesian3,
  type CameraStateRecord,
  Matrix4 as CesiumMatrix4,
  pickBestAvailablePositionAtViewportCenter,
  readCameraWorldBasis,
  readSceneCameraIntrinsics,
  setViewFromCameraState,
  toSceneStateVec3,
  type CameraLike,
  type SceneLike,
} from "@carma-mapping/engines/cesium/api";
import { buildViewStateFromEcef } from "../core/construct";
import type { ViewState, ViewStateMetadata } from "../core/types";

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

    const anchor = toSceneStateVec3(
      pickBestAvailablePositionAtViewportCenter(scene)
    );
    if (!anchor) return null;

    const orientation = buildOrientationQuaternionFromWorldCameraBasisAtAnchor(
      readCameraWorldBasis(camera),
      anchor
    );

    const intrinsics = readSceneCameraIntrinsics(scene);
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

const toCesiumCartesian3 = (value: ViewState["cameraPosition"]): Cartesian3 =>
  new Cartesian3(value.x, value.y, value.z);

// ---------------------------------------------------------------------------
// Apply: ViewState → Cesium scene
// ---------------------------------------------------------------------------

export const readCesiumCameraStateFromViewState = (
  state: ViewState
): CameraStateRecord => {
  const basis = readLocalCameraBasis(state.orientation);
  const direction = localYUpSceneDirectionToWorldDirectionAtAnchor(
    basis.forward,
    state.anchor
  );
  const up = localYUpSceneDirectionToWorldDirectionAtAnchor(
    basis.up,
    state.anchor
  );
  const right = localYUpSceneDirectionToWorldDirectionAtAnchor(
    basis.right,
    state.anchor
  );

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
