import { Matrix4, Quaternion, Vector3, isFiniteNumber } from "@carma/math";
import type { Meters, Radians } from "@carma/units/types";
import { ecefToCartographic } from "@carma/geo/utils";
import type { CameraIntrinsics } from "@carma-commons/camera/model";
import {
  Cartesian2,
  applyObjectCentricCameraViewToScene,
  toSceneStateVec3,
  toSceneStateMat4,
  type CameraLike,
  type SceneLike,
} from "@carma-mapping/engines/cesium/api";
import {
  buildCommonViewStateFromEcef,
  type AngleBasedViewInput,
} from "../core/construct";
import { deriveOrbitAngles } from "../core/derivations";
import type { CommonViewState, ViewStateMetadata } from "../core/types";

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

const readFov = (camera: CameraLike): Radians | undefined => {
  const frustum = camera.frustum;
  if (isFiniteNumber(frustum?.fovy) && frustum.fovy > 0) {
    return frustum.fovy as Radians;
  }
  if (isFiniteNumber(frustum?.fov) && frustum.fov > 0) {
    return frustum.fov as Radians;
  }
  return undefined;
};

const readIntrinsics = (
  camera: CameraLike,
  scene: SceneLike
): CameraIntrinsics => {
  const fov = readFov(camera);
  const frustum = camera.frustum;
  return {
    ...(fov ? { fov } : {}),
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
// Read: Cesium scene → CommonViewState
// ---------------------------------------------------------------------------

export const readFromCesium = (
  scene: SceneLike,
  sourceId: string
): CommonViewState | null => {
  const camera = scene.camera as CameraLike | undefined;
  if (!camera) return null;

  const cameraEcef =
    toSceneStateVec3(camera.positionWC) ?? toSceneStateVec3(camera.position);
  if (!cameraEcef) return null;

  const anchor = sampleOrbitAnchor(scene, camera);
  if (!anchor) return null;

  let orientation: Quaternion;
  const matrixWorld = toSceneStateMat4(camera.inverseViewMatrix);
  if (matrixWorld) {
    orientation = new Quaternion().setFromRotationMatrix(matrixWorld);
  } else {
    const dir = toSceneStateVec3(camera.directionWC);
    const up = toSceneStateVec3(camera.upWC);
    if (dir && up) {
      const right = new Vector3().crossVectors(dir, up).normalize();
      const orthUp = new Vector3().crossVectors(right, dir).normalize();
      const backward = dir.clone().negate();
      const basis = new Matrix4().makeBasis(right, orthUp, backward);
      orientation = new Quaternion().setFromRotationMatrix(basis);
    } else {
      orientation = new Quaternion();
    }
  }

  function buildResult() {
    const intrinsics = readIntrinsics(camera!, scene);
    const frameNumber = (scene as { frameState?: { frameNumber?: number } })
      .frameState?.frameNumber;

    const metadata: ViewStateMetadata = {
      frameId: isFiniteNumber(frameNumber) ? frameNumber : 0,
      timestampMs: Date.now(),
      sourceId,
      source: "user-interaction",
    };

    return buildCommonViewStateFromEcef({
      anchor,
      cameraPosition: cameraEcef!,
      orientation: orientation!,
      intrinsics,
      metadata,
    });
  }

  return buildResult();
};

// ---------------------------------------------------------------------------
// Apply: CommonViewState → Cesium scene
// ---------------------------------------------------------------------------

export const applyToCesium = (
  scene: SceneLike,
  state: CommonViewState
): void => {
  const { bearing, pitch, range } = deriveOrbitAngles(state);
  const carto = state.anchorCartographic;

  // Convert orbit convention pitch back to Cesium pitch
  const cesiumPitch = (pitch as number) - Math.PI * 0.5;
  const cesiumScene = scene as unknown as Parameters<
    typeof applyObjectCentricCameraViewToScene
  >[0]["scene"];

  applyObjectCentricCameraViewToScene({
    scene: cesiumScene,
    view: {
      anchorLngRad: carto.longitude as number,
      anchorLatRad: carto.latitude as number,
      anchorHeightM: carto.altitude as number,
      bearingRad: bearing as number,
      pitchRad: cesiumPitch,
      rangeM: range as number,
      fovVerticalRad: state.intrinsics.fov as number | undefined,
    },
  });
};
