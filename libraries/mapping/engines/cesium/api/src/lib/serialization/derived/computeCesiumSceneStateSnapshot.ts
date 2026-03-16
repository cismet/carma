import type {
  CameraIntrinsics,
  CameraType,
  ObjectCentricCameraModel,
} from "@carma-commons/camera/model";
import {
  Matrix4,
  Quaternion,
  Vector2,
  Vector3,
  isFiniteNumber,
  type Mat4,
  type Vec3,
} from "@carma/math";
import type {
  CameraLike,
  FrustumLike,
  SceneCameraSnapshot,
  SceneLike,
  SceneStateOptions,
  SceneStateSnapshot,
} from "@carma/types";
import type { CssPixels, Meters, Radians } from "@carma/units/types";
import { Cartesian3, PerspectiveFrustum } from "../../cesium";
import {
  captureCurrentCameraState,
  isValidCamera,
  type CapturedCameraState,
} from "../../carma-helpers/camera";
import { getEastNorthUpOffset } from "../../carma-helpers/Transforms";
import { resolveSceneStateOrbitPoint } from "../../carma-helpers/scene-state/SceneStateOrbitPoint";
import {
  toSceneStateCartographicRad,
  toSceneStateMat4,
  toSceneStateVec3,
} from "../../carma-helpers/scene-state/SceneStateValueAdapters";

const DEFAULT_FALLBACK_HEIGHT_M = 200;
const MIN_BASIS_VECTOR_LENGTH = 1e-6;

const readAspectRatio = (
  scene: SceneLike,
  camera: CameraLike | undefined
): number | undefined => {
  const frustumAspectRatio =
    camera?.frustum &&
    typeof camera.frustum === "object" &&
    isFiniteNumber(camera.frustum.aspect) &&
    camera.frustum.aspect > 0
      ? camera.frustum.aspect
      : camera?.frustum &&
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
    return "PerspectiveCamera";
  }

  if (
    frustum &&
    !isFiniteNumber((frustum as { fov?: number }).fov) &&
    (frustum.projectionMode === "orthographic" ||
      isFiniteNumber((frustum as { width?: number }).width) ||
      (isFiniteNumber(frustum.left) &&
        isFiniteNumber(frustum.right) &&
        isFiniteNumber(frustum.top) &&
        isFiniteNumber(frustum.bottom)))
  ) {
    return "OrthographicCamera";
  }

  if (frustum?.type) {
    return frustum.type;
  }

  if (frustum?.projectionMode === "perspective") {
    return "PerspectiveCamera";
  }

  if (frustum?.projectionMode === "orthographic") {
    return "OrthographicCamera";
  }

  return isFiniteNumber(capturedFov) ? "PerspectiveCamera" : undefined;
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

const readProjectionMatrix = (frustum: FrustumLike | undefined): Mat4 | null =>
  toSceneStateMat4((frustum as { projectionMatrix?: unknown } | undefined)?.projectionMatrix);

const readProjectionMatrixInverse = (
  frustum: FrustumLike | undefined,
  projectionMatrix: Mat4 | null
): Mat4 | null => {
  const explicitInverse = toSceneStateMat4(
    (frustum as { projectionMatrixInverse?: unknown } | undefined)
      ?.projectionMatrixInverse
  );
  if (explicitInverse) {
    return explicitInverse;
  }

  if (!projectionMatrix) {
    return null;
  }

  return projectionMatrix.clone().invert();
};

const readImageResolution = (
  scene: SceneLike
): Pick<CameraIntrinsics, "image"> => {
  const width = scene.canvas?.clientWidth;
  const height = scene.canvas?.clientHeight;
  if (
    !isFiniteNumber(width) ||
    !isFiniteNumber(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return {};
  }

  return {
    image: {
      width: width as CssPixels,
      height: height as CssPixels,
    },
  };
};

const readProjectionSnapshot = (
  scene: SceneLike,
  camera: CameraLike | undefined,
  capturedFov?: number
): Pick<
  SceneCameraSnapshot,
  | "type"
  | "projectionMatrix"
  | "projectionMatrixInverse"
  | "fovVertical"
  | "fovHorizontal"
  | "aspect"
  | "aspectRatio"
  | "zoom"
  | "near"
  | "nearPlane"
  | "far"
  | "farPlane"
  | "focus"
  | "filmGauge"
  | "filmOffset"
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "imageWidthPx"
  | "imageHeightPx"
  | "principalPointPx"
  | "view"
> => {
  const frustum = camera?.frustum as FrustumLike | undefined;
  const aspect = readAspectRatio(scene, camera);
  const near =
    frustum && isFiniteNumber(frustum.near)
      ? frustum.near
      : frustum && isFiniteNumber(frustum.nearPlane)
        ? frustum.nearPlane
        : undefined;
  const far =
    frustum && isFiniteNumber(frustum.far)
      ? frustum.far
      : frustum && isFiniteNumber(frustum.farPlane)
        ? frustum.farPlane
        : undefined;
  const type = readProjectionMode({ camera, frustum, capturedFov });
  const fovVertical =
    isFiniteNumber(capturedFov)
      ? (capturedFov as Radians)
      : frustum && isFiniteNumber(frustum.fovVertical)
        ? (frustum.fovVertical as Radians)
        : frustum && isFiniteNumber(frustum.fov)
          ? (frustum.fov as Radians)
          : undefined;
  const fovHorizontal = getHorizontalFov({ fovVertical, aspect });
  const projectionMatrix = readProjectionMatrix(frustum);
  const projectionMatrixInverse = readProjectionMatrixInverse(
    frustum,
    projectionMatrix
  );
  const viewOffset = frustum?.viewOffset;
  const view =
    viewOffset &&
    isFiniteNumber(viewOffset.fullWidthPx) &&
    isFiniteNumber(viewOffset.fullHeightPx) &&
    isFiniteNumber(viewOffset.offsetXPx) &&
    isFiniteNumber(viewOffset.offsetYPx) &&
    isFiniteNumber(viewOffset.widthPx) &&
    isFiniteNumber(viewOffset.heightPx)
      ? {
          enabled: viewOffset.enabled,
          fullWidth: viewOffset.fullWidthPx as CssPixels,
          fullHeight: viewOffset.fullHeightPx as CssPixels,
          offsetX: viewOffset.offsetXPx as CssPixels,
          offsetY: viewOffset.offsetYPx as CssPixels,
          width: viewOffset.widthPx as CssPixels,
          height: viewOffset.heightPx as CssPixels,
        }
      : undefined;
  const image = readImageResolution(scene).image;
  const principalPointPx =
    viewOffset && isFiniteNumber(viewOffset.offsetXPx) && isFiniteNumber(viewOffset.offsetYPx)
      ? new Vector2(
          viewOffset.offsetXPx + viewOffset.widthPx * 0.5,
          viewOffset.offsetYPx + viewOffset.heightPx * 0.5
        )
      : undefined;

  return {
    ...(type ? { type } : {}),
    ...(projectionMatrix ? { projectionMatrix } : {}),
    ...(projectionMatrixInverse ? { projectionMatrixInverse } : {}),
    ...(isFiniteNumber(fovVertical) ? { fovVertical } : {}),
    ...(isFiniteNumber(fovHorizontal) ? { fovHorizontal } : {}),
    ...(isFiniteNumber(aspect) ? { aspect, aspectRatio: aspect } : {}),
    ...(frustum && isFiniteNumber(frustum.zoom) ? { zoom: frustum.zoom } : {}),
    ...(isFiniteNumber(near)
      ? { near: near as Meters, nearPlane: near as Meters }
      : {}),
    ...(isFiniteNumber(far) ? { far: far as Meters, farPlane: far as Meters } : {}),
    ...(frustum && isFiniteNumber(frustum.focus) ? { focus: frustum.focus } : {}),
    ...(frustum && isFiniteNumber(frustum.filmGauge)
      ? { filmGauge: frustum.filmGauge }
      : {}),
    ...(frustum && isFiniteNumber(frustum.filmOffset)
      ? { filmOffset: frustum.filmOffset }
      : {}),
    ...(frustum && isFiniteNumber(frustum.left) ? { left: frustum.left } : {}),
    ...(frustum && isFiniteNumber(frustum.right) ? { right: frustum.right } : {}),
    ...(frustum && isFiniteNumber(frustum.top) ? { top: frustum.top } : {}),
    ...(frustum && isFiniteNumber(frustum.bottom) ? { bottom: frustum.bottom } : {}),
    ...(image?.width ? { imageWidthPx: image.width } : {}),
    ...(image?.height ? { imageHeightPx: image.height } : {}),
    ...(principalPointPx ? { principalPointPx } : {}),
    ...(view ? { view } : {}),
  };
};

const buildBasisMatrixFromWorldMatrix = (matrixWorld: Mat4 | null): Mat4 | null => {
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
  directionWorld: Vec3 | null;
  upWorld: Vec3 | null;
  rightWorld: Vec3 | null;
}): Mat4 | null => {
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

const readDirectionFromBasisMatrix = (basisMatrixWorld: Mat4 | null): Vec3 | null => {
  if (!basisMatrixWorld) {
    return null;
  }

  return new Vector3(0, 0, -1).transformDirection(basisMatrixWorld);
};

const readUpFromBasisMatrix = (basisMatrixWorld: Mat4 | null): Vec3 | null => {
  if (!basisMatrixWorld) {
    return null;
  }

  return new Vector3(0, 1, 0).transformDirection(basisMatrixWorld);
};

const readRightFromBasisMatrix = (basisMatrixWorld: Mat4 | null): Vec3 | null => {
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
  worldPosition: Vec3;
}): Pick<
  SceneCameraSnapshot,
  | "worldPosition"
  | "worldDirection"
  | "worldUp"
  | "worldRight"
  | "worldQuaternion"
  | "matrixWorld"
  | "matrixWorldInverse"
  | "basisMatrixWorld"
  | "viewMatrix"
  | "inverseViewMatrix"
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
    toSceneStateVec3(capturedState.up) ?? readUpFromBasisMatrix(basisMatrixWorld);
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
    ...(matrixWorld ? { matrixWorld, inverseViewMatrix: matrixWorld } : {}),
    ...(matrixWorldInverse
      ? { matrixWorldInverse, viewMatrix: matrixWorldInverse }
      : {}),
    ...(basisMatrixWorld ? { basisMatrixWorld } : {}),
  };
};

const buildSceneCameraSnapshotFromCapturedState = (
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
): SceneCameraSnapshot | null => {
  const worldPosition = toSceneStateVec3(capturedState.position);
  if (!worldPosition) return null;

  const projection = readProjectionSnapshot(
    scene,
    scene.camera as CameraLike | undefined,
    capturedState.fov
  );
  const exterior = buildExteriorSnapshot({
    capturedState,
    worldPosition,
  });

  return {
    ...exterior,
    cartographic: toSceneStateCartographicRad(capturedState.cartographic),
    ...(isFiniteNumber(capturedState.heading)
      ? { headingRad: capturedState.heading }
      : {}),
    ...(isFiniteNumber(capturedState.pitch)
      ? { pitchRad: capturedState.pitch }
      : {}),
    ...(isFiniteNumber(capturedState.roll) ? { rollRad: capturedState.roll } : {}),
    ...projection,
  };
};

const readFallbackCameraSnapshot = (
  scene: SceneLike,
  camera: CameraLike
): SceneCameraSnapshot | null => {
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
  const projection = readProjectionSnapshot(scene, camera);
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
    ...(isFiniteNumber(camera.heading) ? { headingRad: camera.heading } : {}),
    ...(isFiniteNumber(camera.pitch) ? { pitchRad: camera.pitch } : {}),
    ...(isFiniteNumber(camera.roll) ? { rollRad: camera.roll } : {}),
    ...(matrixWorld ? { matrixWorld, inverseViewMatrix: matrixWorld } : {}),
    ...(matrixWorldInverse
      ? { matrixWorldInverse, viewMatrix: matrixWorldInverse }
      : {}),
    ...(basisMatrixWorld ? { basisMatrixWorld } : {}),
    ...projection,
  };
};

const buildCameraModel = ({
  cameraSnapshot,
  orbitPoint,
}: {
  cameraSnapshot: SceneCameraSnapshot;
  orbitPoint: SceneStateSnapshot["orbitPoint"];
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
  const objectCentricHeading = Math.atan2(
    -offsetAtAnchorEnu.east,
    -offsetAtAnchorEnu.north
  );
  const objectCentricPitch = -Math.atan2(
    offsetAtAnchorEnu.up,
    horizontalDistance
  );

  const intrinsics: CameraIntrinsics = {
    ...(cameraSnapshot.type ? { type: cameraSnapshot.type } : {}),
    ...(cameraSnapshot.projectionMatrix
      ? { projectionMatrix: cameraSnapshot.projectionMatrix }
      : {}),
    ...(cameraSnapshot.projectionMatrixInverse
      ? { projectionMatrixInverse: cameraSnapshot.projectionMatrixInverse }
      : {}),
    ...(isFiniteNumber(cameraSnapshot.fovVertical)
      ? { fov: cameraSnapshot.fovVertical as Radians }
      : {}),
    ...(isFiniteNumber(cameraSnapshot.fovHorizontal)
      ? { fovHorizontal: cameraSnapshot.fovHorizontal as Radians }
      : {}),
    ...(isFiniteNumber(cameraSnapshot.aspect)
      ? { aspect: cameraSnapshot.aspect }
      : {}),
    ...(isFiniteNumber(cameraSnapshot.zoom) ? { zoom: cameraSnapshot.zoom } : {}),
    ...(isFiniteNumber(cameraSnapshot.near)
      ? { near: cameraSnapshot.near as Meters }
      : {}),
    ...(isFiniteNumber(cameraSnapshot.far)
      ? { far: cameraSnapshot.far as Meters }
      : {}),
    ...(isFiniteNumber(cameraSnapshot.focus)
      ? { focus: cameraSnapshot.focus }
      : {}),
    ...(isFiniteNumber(cameraSnapshot.filmGauge)
      ? { filmGauge: cameraSnapshot.filmGauge }
      : {}),
    ...(isFiniteNumber(cameraSnapshot.filmOffset)
      ? { filmOffset: cameraSnapshot.filmOffset }
      : {}),
    ...(isFiniteNumber(cameraSnapshot.focalLength)
      ? { focalLength: cameraSnapshot.focalLength }
      : {}),
    ...(isFiniteNumber(cameraSnapshot.left) ? { left: cameraSnapshot.left } : {}),
    ...(isFiniteNumber(cameraSnapshot.right)
      ? { right: cameraSnapshot.right }
      : {}),
    ...(isFiniteNumber(cameraSnapshot.top) ? { top: cameraSnapshot.top } : {}),
    ...(isFiniteNumber(cameraSnapshot.bottom)
      ? { bottom: cameraSnapshot.bottom }
      : {}),
    ...(cameraSnapshot.principalPointPx
      ? { principalPoint: cameraSnapshot.principalPointPx }
      : {}),
    ...(cameraSnapshot.imageWidthPx && cameraSnapshot.imageHeightPx
      ? {
          image: {
            width: cameraSnapshot.imageWidthPx,
            height: cameraSnapshot.imageHeightPx,
          },
        }
      : {}),
    ...(cameraSnapshot.view ? { view: cameraSnapshot.view } : {}),
  };

  return {
    pose: {
      anchor: {
        longitude: orbitPoint.cartographic.longitude,
        latitude: orbitPoint.cartographic.latitude,
        altitude: orbitPoint.cartographic.altitude,
      },
      heading: objectCentricHeading as Radians,
      pitch: objectCentricPitch as Radians,
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
    intrinsics,
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
        scene,
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
  const cameraModel = buildCameraModel({
    cameraSnapshot,
    orbitPoint,
  });

  return {
    frameNumber: metadata.frameNumber,
    timestampMs: metadata.timestampMs,
    camera: {
      ...cameraSnapshot,
      ...(cameraModel ? { cameraModel } : {}),
    },
    orbitPoint,
  };
};
