import { Matrix4, Quaternion, Vector3, isFiniteNumber } from "@carma/math";
import type { Meters, Radians } from "@carma/units/types";
import {
  Cartesian3,
  JulianDate,
  Matrix3,
  PerspectiveFrustum,
  Simon1994PlanetaryPositions,
  Transforms,
  captureCurrentCameraState,
  isValidCamera,
  type CapturedCameraState,
  getEastNorthUpOffset,
  toSceneStateCartographicRad,
  toSceneStateMat4,
  toSceneStateVec3,
} from "@carma/cesium";
import type {
  CameraIntrinsics,
  CameraLike,
  CameraType,
  FrustumLike,
  ObjectCentricCameraModel,
  SceneCamera,
  SceneLighting,
  SceneLike,
  SceneStateMetadata,
  SceneStateOptions,
  SceneState,
} from "../types";

import { resolveSceneStateOrbitPoint } from "./SceneStateOrbitPoint";

const DEFAULT_FALLBACK_HEIGHT_M = 200;
const MIN_BASIS_VECTOR_LENGTH = 1e-6;
const SCENE_LIGHT_DISTANCE_SCALE = 1e-6;

const readSceneLighting = ({
  scene,
  referencePointWorld,
}: {
  scene: SceneLike;
  referencePointWorld: Vector3;
}): SceneLighting | undefined => {
  const frameTime = (scene as { frameState?: { time?: unknown } }).frameState
    ?.time as JulianDate | undefined;
  const resolvedTime = frameTime ?? JulianDate.now();
  const icrfToFixed = Transforms.computeIcrfToFixedMatrix(resolvedTime);
  if (!icrfToFixed) {
    return undefined;
  }

  const sunPositionInertial =
    Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(
      resolvedTime,
      new Cartesian3()
    );
  const sunPositionFixed = Matrix3.multiplyByVector(
    icrfToFixed,
    sunPositionInertial,
    new Cartesian3()
  );
  const referencePointEcef = Cartesian3.fromElements(
    referencePointWorld.x,
    referencePointWorld.y,
    referencePointWorld.z,
    new Cartesian3()
  );
  const sunOffsetEnu = getEastNorthUpOffset(
    sunPositionFixed,
    referencePointEcef
  );
  const sunPositionWorld = new Vector3(
    sunOffsetEnu.east * SCENE_LIGHT_DISTANCE_SCALE,
    sunOffsetEnu.up * SCENE_LIGHT_DISTANCE_SCALE,
    -sunOffsetEnu.north * SCENE_LIGHT_DISTANCE_SCALE
  ) satisfies Vector3;

  return {
    sunPositionWorld,
  };
};

const readAspectRatio = (
  scene: SceneLike,
  camera: CameraLike | undefined
): number | undefined => {
  const frustumAspectRatio =
    camera?.frustum &&
    typeof camera.frustum === "object" &&
    isFiniteNumber(camera.frustum.aspectRatio) &&
    camera.frustum.aspectRatio > 0
      ? camera.frustum.aspectRatio
      : undefined;
  if (isFiniteNumber(frustumAspectRatio) && frustumAspectRatio > 0) {
    return frustumAspectRatio;
  }

  const width = scene.canvas?.clientWidth;
  const height = scene.canvas?.clientHeight;
  if (
    isFiniteNumber(width) &&
    isFiniteNumber(height) &&
    width > 0 &&
    height > 0
  ) {
    return width / height;
  }

  return undefined;
};

const readProjectionMode = ({
  camera,
  frustum,
  capturedFov,
}: {
  camera: CameraLike | undefined;
  frustum: FrustumLike | undefined;
  capturedFov?: number;
}): CameraType | undefined => {
  if (camera?.frustum instanceof PerspectiveFrustum) {
    return "PerspectiveCamera" as CameraType;
  }

  if (
    frustum &&
    !isFiniteNumber((frustum as { fov?: number }).fov) &&
    (isFiniteNumber((frustum as { width?: number }).width) ||
      (isFiniteNumber(frustum.left) &&
        isFiniteNumber(frustum.right) &&
        isFiniteNumber(frustum.top) &&
        isFiniteNumber(frustum.bottom)))
  ) {
    return "OrthographicCamera" as CameraType;
  }

  return isFiniteNumber(capturedFov)
    ? ("PerspectiveCamera" as CameraType)
    : undefined;
};

const getHorizontalFov = ({
  fovVertical,
  aspect,
}: {
  fovVertical: number | undefined;
  aspect: number | undefined;
}): Radians | undefined => {
  if (!isFiniteNumber(fovVertical) || !isFiniteNumber(aspect) || aspect <= 0) {
    return undefined;
  }

  return (Math.atan(Math.tan(fovVertical * 0.5) * aspect) * 2) as Radians;
};

const getVerticalFov = ({
  frustum,
  capturedFov,
  aspect,
}: {
  frustum: FrustumLike | undefined;
  capturedFov?: number;
  aspect: number | undefined;
}): Radians | undefined => {
  if (frustum && isFiniteNumber(frustum.fovy) && frustum.fovy > 0) {
    return frustum.fovy as Radians;
  }

  if (!isFiniteNumber(capturedFov) || capturedFov <= 0) {
    return frustum && isFiniteNumber(frustum?.fov) && frustum.fov > 0
      ? (frustum.fov as Radians)
      : undefined;
  }

  if (isFiniteNumber(aspect) && aspect > 1) {
    return (Math.atan(Math.tan(capturedFov * 0.5) / aspect) * 2) as Radians;
  }

  return capturedFov as Radians;
};

const readProjectionMatrix = (
  frustum: FrustumLike | undefined
): Matrix4 | null =>
  toSceneStateMat4(
    (frustum as { projectionMatrix?: unknown } | undefined)?.projectionMatrix
  );

const readProjectionSnapshot = (
  scene: SceneLike,
  camera: CameraLike | undefined,
  capturedFov?: number
): CameraIntrinsics | undefined => {
  const frustum = camera?.frustum as FrustumLike | undefined;
  const aspect = readAspectRatio(scene, camera);
  const near =
    frustum && isFiniteNumber(frustum.near) ? frustum.near : undefined;
  const far = frustum && isFiniteNumber(frustum.far) ? frustum.far : undefined;
  const type = readProjectionMode({ camera, frustum, capturedFov });
  const fovVertical = getVerticalFov({
    frustum,
    capturedFov,
    aspect,
  });
  const fovHorizontal = getHorizontalFov({ fovVertical, aspect });
  const projectionMatrix = readProjectionMatrix(frustum);
  const intrinsics = {
    ...(type ? { type } : {}),
    ...(projectionMatrix ? { projectionMatrix } : {}),
    ...(isFiniteNumber(fovVertical) ? { fov: fovVertical as Radians } : {}),
    ...(isFiniteNumber(fovHorizontal)
      ? { fovHorizontal: fovHorizontal as Radians }
      : {}),
    ...(isFiniteNumber(near) || isFiniteNumber(far)
      ? {
          frustum: {
            ...(isFiniteNumber(near) ? { near: near as Meters } : {}),
            ...(isFiniteNumber(far) ? { far: far as Meters } : {}),
          },
        }
      : {}),
  } satisfies CameraIntrinsics;

  return Object.keys(intrinsics).length > 0 ? intrinsics : undefined;
};

const buildBasisMatrixFromWorldMatrix = (
  matrixWorld: Matrix4 | null
): Matrix4 | null => {
  if (!matrixWorld) {
    return null;
  }

  const right = new Vector3();
  const up = new Vector3();
  const backward = new Vector3();
  matrixWorld.extractBasis(right, up, backward);
  if (
    right.lengthSq() < MIN_BASIS_VECTOR_LENGTH ||
    up.lengthSq() < MIN_BASIS_VECTOR_LENGTH ||
    backward.lengthSq() < MIN_BASIS_VECTOR_LENGTH
  ) {
    return null;
  }

  right.normalize();
  up.normalize();
  backward.normalize();
  return new Matrix4().makeBasis(right, up, backward);
};

const buildBasisMatrixFromVectors = ({
  directionWorld,
  upWorld,
  rightWorld,
}: {
  directionWorld: Vector3 | null;
  upWorld: Vector3 | null;
  rightWorld: Vector3 | null;
}): Matrix4 | null => {
  if (!directionWorld || !upWorld) {
    return null;
  }

  const forward = directionWorld.clone().normalize();
  const up = upWorld.clone().normalize();
  let right = rightWorld?.clone().normalize() ?? new Vector3();
  if (!rightWorld || right.lengthSq() < MIN_BASIS_VECTOR_LENGTH) {
    right.crossVectors(forward, up);
    if (right.lengthSq() < MIN_BASIS_VECTOR_LENGTH) {
      return null;
    }
    right.normalize();
  }

  const orthonormalUp = new Vector3().crossVectors(right, forward).normalize();
  const backward = forward.clone().negate();
  return new Matrix4().makeBasis(right, orthonormalUp, backward);
};

const readDirectionFromBasisMatrix = (
  basisMatrixWorld: Matrix4 | null
): Vector3 | null => {
  if (!basisMatrixWorld) {
    return null;
  }

  return new Vector3(0, 0, -1).transformDirection(basisMatrixWorld);
};

const readUpFromBasisMatrix = (
  basisMatrixWorld: Matrix4 | null
): Vector3 | null => {
  if (!basisMatrixWorld) {
    return null;
  }

  return new Vector3(0, 1, 0).transformDirection(basisMatrixWorld);
};

const readRightFromBasisMatrix = (
  basisMatrixWorld: Matrix4 | null
): Vector3 | null => {
  if (!basisMatrixWorld) {
    return null;
  }

  return new Vector3(1, 0, 0).transformDirection(basisMatrixWorld);
};

const buildExteriorSnapshot = ({
  capturedState,
  worldPosition,
}: {
  capturedState: Pick<
    CapturedCameraState,
    | "position"
    | "direction"
    | "up"
    | "right"
    | "viewMatrix"
    | "inverseViewMatrix"
  >;
  worldPosition: Vector3;
}): Pick<
  SceneCamera,
  | "worldPosition"
  | "worldDirection"
  | "worldUp"
  | "worldRight"
  | "worldQuaternion"
  | "matrixWorld"
  | "matrixWorldInverse"
  | "basisMatrixWorld"
> => {
  const matrixWorld = toSceneStateMat4(capturedState.inverseViewMatrix);
  const matrixWorldInverse = toSceneStateMat4(capturedState.viewMatrix);
  const basisMatrixWorld =
    buildBasisMatrixFromWorldMatrix(matrixWorld) ??
    buildBasisMatrixFromVectors({
      directionWorld: toSceneStateVec3(capturedState.direction),
      upWorld: toSceneStateVec3(capturedState.up),
      rightWorld: toSceneStateVec3(capturedState.right),
    });
  const worldDirection =
    toSceneStateVec3(capturedState.direction) ??
    readDirectionFromBasisMatrix(basisMatrixWorld);
  const worldUp =
    toSceneStateVec3(capturedState.up) ??
    readUpFromBasisMatrix(basisMatrixWorld);
  const worldRight =
    toSceneStateVec3(capturedState.right) ??
    readRightFromBasisMatrix(basisMatrixWorld);
  const worldQuaternion = basisMatrixWorld
    ? new Quaternion().setFromRotationMatrix(basisMatrixWorld)
    : null;

  return {
    worldPosition,
    ...(worldDirection ? { worldDirection } : {}),
    ...(worldUp ? { worldUp } : {}),
    ...(worldRight ? { worldRight } : {}),
    ...(worldQuaternion ? { worldQuaternion } : {}),
    ...(matrixWorld ? { matrixWorld } : {}),
    ...(matrixWorldInverse ? { matrixWorldInverse } : {}),
    ...(basisMatrixWorld ? { basisMatrixWorld } : {}),
  };
};

const buildSceneCameraFromCapturedState = (
  scene: SceneLike,
  capturedState: Pick<
    CapturedCameraState,
    | "position"
    | "direction"
    | "up"
    | "right"
    | "cartographic"
    | "heading"
    | "pitch"
    | "roll"
    | "fov"
    | "viewMatrix"
    | "inverseViewMatrix"
  >
): SceneCamera | null => {
  const worldPosition = toSceneStateVec3(capturedState.position);
  if (!worldPosition) return null;
  const exterior = buildExteriorSnapshot({
    capturedState,
    worldPosition,
  });

  return {
    ...exterior,
    cartographic: toSceneStateCartographicRad(capturedState.cartographic),
    ...(isFiniteNumber(capturedState.heading)
      ? { bearingRad: capturedState.heading }
      : {}),
    ...(isFiniteNumber(capturedState.pitch)
      ? { pitchRad: capturedState.pitch }
      : {}),
    ...(isFiniteNumber(capturedState.roll)
      ? { rollRad: capturedState.roll }
      : {}),
  };
};

const readFallbackCameraSnapshot = (
  scene: SceneLike,
  camera: CameraLike
): SceneCamera | null => {
  const worldPosition =
    toSceneStateVec3(camera.positionWC) ?? toSceneStateVec3(camera.position);
  if (!worldPosition) return null;

  const cartographic =
    toSceneStateCartographicRad(camera.positionCartographic) ??
    toSceneStateCartographicRad(
      scene.globe?.ellipsoid?.cartesianToCartographic?.(
        toSceneStateVec3(
          Cartesian3.fromElements(
            worldPosition.x,
            worldPosition.y,
            worldPosition.z,
            new Cartesian3()
          )
        ) ?? worldPosition
      ) ?? null
    );
  const matrixWorld = toSceneStateMat4(camera.inverseViewMatrix);
  const matrixWorldInverse = toSceneStateMat4(camera.viewMatrix);
  const basisMatrixWorld = buildBasisMatrixFromWorldMatrix(matrixWorld);
  const worldDirection =
    toSceneStateVec3(camera.directionWC) ??
    readDirectionFromBasisMatrix(basisMatrixWorld);
  const worldUp =
    toSceneStateVec3(camera.upWC) ?? readUpFromBasisMatrix(basisMatrixWorld);
  const worldRight =
    toSceneStateVec3(camera.rightWC) ??
    readRightFromBasisMatrix(basisMatrixWorld);
  const worldQuaternion = basisMatrixWorld
    ? new Quaternion().setFromRotationMatrix(basisMatrixWorld)
    : null;

  return {
    worldPosition,
    ...(worldDirection ? { worldDirection } : {}),
    ...(worldUp ? { worldUp } : {}),
    ...(worldRight ? { worldRight } : {}),
    ...(worldQuaternion ? { worldQuaternion } : {}),
    cartographic,
    ...(isFiniteNumber(camera.heading) ? { bearingRad: camera.heading } : {}),
    ...(isFiniteNumber(camera.pitch) ? { pitchRad: camera.pitch } : {}),
    ...(isFiniteNumber(camera.roll) ? { rollRad: camera.roll } : {}),
    ...(matrixWorld ? { matrixWorld } : {}),
    ...(matrixWorldInverse ? { matrixWorldInverse } : {}),
    ...(basisMatrixWorld ? { basisMatrixWorld } : {}),
  };
};

const buildCameraModel = ({
  cameraSnapshot,
  intrinsics,
  orbitPoint,
}: {
  cameraSnapshot: SceneCamera;
  intrinsics?: CameraIntrinsics;
  orbitPoint: SceneState["orbitPoint"];
}): ObjectCentricCameraModel | null => {
  if (
    !orbitPoint?.worldPosition ||
    !orbitPoint.cartographic ||
    !isFiniteNumber(orbitPoint.cartographic.altitude)
  ) {
    return null;
  }

  const cameraPosition = Cartesian3.fromElements(
    cameraSnapshot.worldPosition.x,
    cameraSnapshot.worldPosition.y,
    cameraSnapshot.worldPosition.z,
    new Cartesian3()
  );
  const anchorPosition = Cartesian3.fromElements(
    orbitPoint.worldPosition.x,
    orbitPoint.worldPosition.y,
    orbitPoint.worldPosition.z,
    new Cartesian3()
  );
  // Reconstruct the shared object-centric orbit state directly from world
  // coordinates: anchor WC + camera WC -> anchor-centered ENU offset. This
  // intentionally avoids relying on Cesium's camera heading/pitch getters or
  // any transient HeadingPitchRange state on the camera object, because those
  // angle views are tied to Cesium-specific ENU origins and become ambiguous
  // near nadir.
  // The shared object-centric ENU frame is centered at the orbit/reference
  // point itself, i.e. at the ECEF position corresponding to
  // (longitude, latitude, h). Here h is the geodetic / ellipsoidal height of
  // the anchor, not an extra offset above some separate EN plane on the
  // ellipsoid surface.
  const offsetAtAnchorEnu = getEastNorthUpOffset(
    cameraPosition,
    anchorPosition
  );
  const rangeMeters = Cartesian3.distance(cameraPosition, anchorPosition);
  if (!isFiniteNumber(rangeMeters)) {
    return null;
  }

  const horizontalDistance = Math.hypot(
    offsetAtAnchorEnu.east,
    offsetAtAnchorEnu.north
  );
  // Cesium HeadingPitchRange heading describes the viewing azimuth, not the
  // raw anchor->camera offset. lookAt() negates the offset internally, so the
  // heading must be derived from the target-facing direction here as well.
  const objectCentricBearing = Math.atan2(
    -offsetAtAnchorEnu.east,
    -offsetAtAnchorEnu.north
  );
  const cesiumObjectCentricPitch = -Math.atan2(
    offsetAtAnchorEnu.up,
    horizontalDistance
  );
  // Cesium HeadingPitchRange pitch is measured from the local EN plane:
  // -PI/2 = nadir, 0 = horizon. The shared camera model stores object-centric
  // pitch in the MapLibre-style orbit convention:
  // 0 = nadir, +PI/2 = horizon.
  const objectCentricPitch = (cesiumObjectCentricPitch +
    Math.PI * 0.5) as Radians;

  return {
    pose: {
      anchor: {
        longitude: orbitPoint.cartographic.longitude,
        latitude: orbitPoint.cartographic.latitude,
        // Cesium cartographic height is geodetic / ellipsoidal height h.
        // The shared anchor altitude intentionally preserves that meaning.
        altitude: orbitPoint.cartographic.altitude,
      },
      bearing: objectCentricBearing as Radians,
      pitch: objectCentricPitch,
      range: rangeMeters as Meters,
      ...(isFiniteNumber(cameraSnapshot.rollRad)
        ? { roll: cameraSnapshot.rollRad as Radians }
        : {}),
      ...(cameraSnapshot.matrixWorld
        ? { matrixWorld: cameraSnapshot.matrixWorld }
        : {}),
      ...(cameraSnapshot.matrixWorldInverse
        ? { matrixWorldInverse: cameraSnapshot.matrixWorldInverse }
        : {}),
      ...(cameraSnapshot.basisMatrixWorld
        ? { basisMatrix: cameraSnapshot.basisMatrixWorld }
        : {}),
      ...(cameraSnapshot.worldPosition
        ? { position: cameraSnapshot.worldPosition }
        : {}),
      ...(cameraSnapshot.worldDirection
        ? { direction: cameraSnapshot.worldDirection }
        : {}),
      ...(cameraSnapshot.worldUp ? { up: cameraSnapshot.worldUp } : {}),
      ...(cameraSnapshot.worldRight
        ? { right: cameraSnapshot.worldRight }
        : {}),
      ...(cameraSnapshot.worldQuaternion
        ? { quaternion: cameraSnapshot.worldQuaternion }
        : {}),
      ...(cameraSnapshot.worldDirection && cameraSnapshot.worldUp
        ? {
            basis: {
              direction: cameraSnapshot.worldDirection,
              up: cameraSnapshot.worldUp,
              ...(cameraSnapshot.worldRight
                ? { right: cameraSnapshot.worldRight }
                : {}),
            },
          }
        : {}),
    },
    ...(intrinsics ? { intrinsics } : {}),
  };
};

export const computeCesiumSceneState = (
  scene: SceneLike,
  {
    orbitPointMode = "screen-center",
    fallbackHeightM = DEFAULT_FALLBACK_HEIGHT_M,
    screenCenterSamplingStrategy = "depth-first",
    throwOnMissingScreenCenterIntersection = false,
  }: SceneStateOptions = {},
  metadata: SceneStateMetadata
): SceneState | null => {
  const camera = scene.camera as CameraLike | undefined;
  if (!camera) {
    return null;
  }

  const capturedState = isValidCamera(camera)
    ? captureCurrentCameraState(camera, {
        includeFov: true,
        includeOrientation: true,
        includeCartographic: true,
        includeMatrices: true,
      })
    : null;
  const intrinsics = readProjectionSnapshot(scene, camera, capturedState?.fov);
  const cameraSnapshot = capturedState
    ? buildSceneCameraFromCapturedState(scene, capturedState)
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
  const cameraModel = buildCameraModel({
    cameraSnapshot,
    intrinsics,
    orbitPoint,
  });
  const lighting = readSceneLighting({
    scene,
    referencePointWorld:
      orbitPoint?.worldPosition ?? cameraSnapshot.worldPosition,
  });

  return {
    metadata: {
      frameNumber: metadata.frameNumber,
      timestampMs: metadata.timestampMs,
      ...(metadata.source ? { source: metadata.source } : {}),
    },
    camera: {
      ...cameraSnapshot,
      ...(cameraModel ? { cameraModel } : {}),
    },
    orbitPoint,
    ...(lighting ? { lighting } : {}),
  };
};
