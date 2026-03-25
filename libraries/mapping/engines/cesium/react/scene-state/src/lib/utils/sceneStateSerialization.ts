import {
  Cartesian3 as CesiumCartesian3,
  Cartographic,
  cartesian3FromCartographicRad,
  cartesian3FromJson,
  cartesian3ToJson,
  cartographicRadFromCartesian3,
  cartographicRadFromJson,
  cartographicRadToJson,
  isCartesian3Json,
  isCartographicRadJson,
  isMatrix4Json,
  isQuaternionJson,
  matrix4FromJson,
  matrix4ToJson,
  quaternionFromJson,
  quaternionToJson,
  type Cartesian3,
  type Cartesian3Json,
  type CartographicRadJson,
  type Matrix4ConstructorArgs,
  type QuaternionJson,
} from "@carma/cesium";
import { isFiniteNumber } from "@carma/math";
import type { LatLngAlt } from "@carma/geo/types";
import type {
  CameraIntrinsics,
  ObjectCentricCameraModel,
  ObjectCentricCameraPose,
  OrbitPoint,
  SceneState,
} from "../types";

type JsonSceneCamera = {
  anchorEcef?: Cartesian3Json;
  orientationQuat?: QuaternionJson;
  viewMatrix?: Matrix4ConstructorArgs;
  intrinsicsFov?: number;
  intrinsicsFovHorizontal?: number;
};

type JsonOrbitPoint = {
  worldPosition: Cartesian3Json;
  cartographic: CartographicRadJson | null;
  source: OrbitPoint["source"];
};

export type SerializedSceneState = {
  metadata: SceneState["metadata"];
  camera: JsonSceneCamera;
  orbitPoint: JsonOrbitPoint | null;
};

type QuaternionLike = Parameters<typeof quaternionToJson>[0];

const anchorEcefScratch = new CesiumCartesian3();
const anchorCartographicScratch = new Cartographic();

const toAnchorEcef = (
  pose: ObjectCentricCameraPose | undefined
): Cartesian3 | undefined => {
  if (!pose) {
    return undefined;
  }
  if (
    pose.position &&
    isFiniteNumber(pose.position.x) &&
    isFiniteNumber(pose.position.y) &&
    isFiniteNumber(pose.position.z)
  ) {
    return pose.position as unknown as Cartesian3;
  }
  if (
    pose.anchor &&
    isFiniteNumber(pose.anchor.longitude) &&
    isFiniteNumber(pose.anchor.latitude)
  ) {
    return cartesian3FromCartographicRad(
      {
        longitude: pose.anchor.longitude as LatLngAlt.rad["longitude"],
        latitude: pose.anchor.latitude as LatLngAlt.rad["latitude"],
        altitude: (isFiniteNumber(pose.anchor.altitude)
          ? pose.anchor.altitude
          : 0) as NonNullable<LatLngAlt.rad["altitude"]>,
      },
      anchorEcefScratch
    );
  }
  return undefined;
};

const toAnchorCartographic = (
  anchorEcef: Cartesian3 | null | undefined
): LatLngAlt.rad | null => {
  if (
    !anchorEcef ||
    !isCartesian3Json(anchorEcef as unknown as Cartesian3Json)
  ) {
    return null;
  }
  return cartographicRadFromCartesian3(
    anchorEcef as unknown as CesiumCartesian3,
    anchorCartographicScratch
  );
};

const serializePoseFields = (
  pose: ObjectCentricCameraPose | undefined
): Pick<JsonSceneCamera, "anchorEcef" | "viewMatrix"> => {
  if (!pose) {
    return {};
  }

  const anchorEcef = toAnchorEcef(pose);

  return {
    ...(anchorEcef
      ? {
          anchorEcef: cartesian3ToJson(
            anchorEcef as unknown as CesiumCartesian3
          ),
        }
      : {}),
    ...(pose.matrixWorldInverse
      ? {
          viewMatrix: matrix4ToJson(pose.matrixWorldInverse) ?? undefined,
        }
      : {}),
  };
};

const deserializePoseFields = (
  value: JsonSceneCamera
): ObjectCentricCameraPose | undefined => {
  const anchorEcef = isCartesian3Json(value.anchorEcef)
    ? (cartesian3FromJson(value.anchorEcef) as unknown as Cartesian3)
    : undefined;
  const derivedAnchorCartographic = anchorEcef
    ? cartographicRadFromCartesian3(
        anchorEcef as unknown as CesiumCartesian3,
        anchorCartographicScratch
      )
    : undefined;

  if (
    !derivedAnchorCartographic ||
    !isFiniteNumber(derivedAnchorCartographic.longitude) ||
    !isFiniteNumber(derivedAnchorCartographic.latitude) ||
    !isFiniteNumber(derivedAnchorCartographic.altitude)
  ) {
    return undefined;
  }

  const partialPose = {
    anchor: {
      longitude:
        derivedAnchorCartographic.longitude as ObjectCentricCameraPose["anchor"]["longitude"],
      latitude:
        derivedAnchorCartographic.latitude as ObjectCentricCameraPose["anchor"]["latitude"],
      altitude:
        derivedAnchorCartographic.altitude as ObjectCentricCameraPose["anchor"]["altitude"],
    },
    ...(isQuaternionJson(value.orientationQuat)
      ? {
          quaternion: quaternionFromJson(
            value.orientationQuat
          ) as unknown as NonNullable<ObjectCentricCameraPose["quaternion"]>,
        }
      : {}),
    ...(anchorEcef
      ? {
          position: anchorEcef as unknown as NonNullable<
            ObjectCentricCameraPose["position"]
          >,
        }
      : {}),
    ...(isMatrix4Json(value.viewMatrix)
      ? {
          matrixWorldInverse: matrix4FromJson(
            value.viewMatrix
          ) as unknown as NonNullable<
            ObjectCentricCameraPose["matrixWorldInverse"]
          >,
        }
      : {}),
  };

  return partialPose as unknown as ObjectCentricCameraPose;
};

const serializeIntrinsicsFields = (
  intrinsics: CameraIntrinsics | undefined
): Pick<JsonSceneCamera, "intrinsicsFov" | "intrinsicsFovHorizontal"> => {
  if (!intrinsics) {
    return {};
  }

  return {
    ...(isFiniteNumber(intrinsics.fov)
      ? { intrinsicsFov: intrinsics.fov }
      : {}),
    ...(isFiniteNumber(intrinsics.fovHorizontal)
      ? { intrinsicsFovHorizontal: intrinsics.fovHorizontal }
      : {}),
  };
};

const deserializeIntrinsicsFields = (
  value: JsonSceneCamera
): CameraIntrinsics | undefined => {
  const hasAnyIntrinsicsField =
    isFiniteNumber(value.intrinsicsFov) ||
    isFiniteNumber(value.intrinsicsFovHorizontal);

  if (!hasAnyIntrinsicsField) {
    return undefined;
  }

  return {
    ...(isFiniteNumber(value.intrinsicsFov)
      ? { fov: value.intrinsicsFov as CameraIntrinsics["fov"] }
      : {}),
    ...(isFiniteNumber(value.intrinsicsFovHorizontal)
      ? {
          fovHorizontal:
            value.intrinsicsFovHorizontal as CameraIntrinsics["fovHorizontal"],
        }
      : {}),
  };
};

const deserializeCameraModel = (
  value: JsonSceneCamera
): ObjectCentricCameraModel | undefined => {
  const pose = deserializePoseFields(value);
  if (!pose) {
    return undefined;
  }

  const intrinsics = deserializeIntrinsicsFields(value);
  return {
    pose,
    ...(intrinsics ? { intrinsics } : {}),
  };
};

export const serializeSceneState = (
  value: SceneState | null
): SerializedSceneState | null => {
  if (!value) return null;

  return {
    metadata: value.metadata,
    camera: {
      ...(value.camera.cameraModel?.pose.quaternion
        ? {
            orientationQuat: quaternionToJson(
              value.camera.cameraModel.pose.quaternion as QuaternionLike
            ),
          }
        : value.camera.worldQuaternion
        ? {
            orientationQuat: quaternionToJson(
              value.camera.worldQuaternion as QuaternionLike
            ),
          }
        : {}),
      ...serializePoseFields(value.camera.cameraModel?.pose),
      ...(!value.camera.cameraModel?.pose.matrixWorldInverse &&
      value.camera.matrixWorldInverse
        ? {
            viewMatrix:
              matrix4ToJson(value.camera.matrixWorldInverse) ?? undefined,
          }
        : {}),
      ...serializeIntrinsicsFields(value.camera.cameraModel?.intrinsics),
    },
    orbitPoint:
      value.orbitPoint && value.orbitPoint.worldPosition
        ? {
            worldPosition: cartesian3ToJson(
              value.orbitPoint.worldPosition as unknown as CesiumCartesian3
            ),
            cartographic: value.orbitPoint.cartographic
              ? cartographicRadToJson(value.orbitPoint.cartographic)
              : null,
            source: value.orbitPoint.source,
          }
        : null,
  };
};

export const deserializeSceneState = (
  value: SerializedSceneState | null
): SceneState | null => {
  if (!value) return null;

  const cameraModel = deserializeCameraModel(value.camera);
  const anchorEcef = isCartesian3Json(value.camera.anchorEcef)
    ? (cartesian3FromJson(value.camera.anchorEcef) as unknown as Cartesian3)
    : null;
  const resolvedCartographic = toAnchorCartographic(anchorEcef);

  return {
    metadata: value.metadata,
    camera: {
      worldPosition:
        (cameraModel?.pose
          .position as unknown as SceneState["camera"]["worldPosition"]) ??
        ({
          x: 0,
          y: 0,
          z: 0,
        } as unknown as SceneState["camera"]["worldPosition"]),
      cartographic: resolvedCartographic,
      ...(cameraModel ? { cameraModel } : {}),
      ...(isMatrix4Json(value.camera.viewMatrix)
        ? {
            matrixWorldInverse: matrix4FromJson(
              value.camera.viewMatrix
            ) as SceneState["camera"]["matrixWorldInverse"],
          }
        : cameraModel?.pose.matrixWorldInverse
        ? {
            matrixWorldInverse: cameraModel.pose
              .matrixWorldInverse as SceneState["camera"]["matrixWorldInverse"],
          }
        : {}),
      ...(isQuaternionJson(value.camera.orientationQuat)
        ? {
            worldQuaternion: quaternionFromJson(
              value.camera.orientationQuat
            ) as SceneState["camera"]["worldQuaternion"],
          }
        : {}),
    },
    orbitPoint:
      value.orbitPoint && value.orbitPoint.worldPosition
        ? {
            worldPosition: cartesian3FromJson(
              value.orbitPoint.worldPosition
            ) as unknown as NonNullable<
              SceneState["orbitPoint"]
            >["worldPosition"],
            cartographic: isCartographicRadJson(value.orbitPoint.cartographic)
              ? cartographicRadFromJson(value.orbitPoint.cartographic)
              : null,
            source: value.orbitPoint.source,
          }
        : null,
  };
};
