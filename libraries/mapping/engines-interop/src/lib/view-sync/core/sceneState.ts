import type { ObjectCentricCameraModel } from "@carma-commons/camera/model";
import type { Matrix4, Quaternion, Vector3 } from "@carma/math";
import type { LatLngAlt } from "@carma/geo/types";

export type OrbitPointMode = "screen-center" | "camera-position";
export type OrbitPointSamplingStrategy =
  | "depth-first"
  | "terrain-first"
  | "depth-only"
  | "terrain-only";

export type OrbitPointSource =
  | "screen-center-depth"
  | "screen-center-globe"
  | "camera-position"
  | "fallback";

export type SceneLighting = {
  sunPositionWorld?: Vector3;
};

export type SceneCamera = {
  cameraModel?: ObjectCentricCameraModel;
  worldPosition: Vector3;
  // These world-space basis vectors / quaternion are the most stable camera
  // attitude representation. They can be compared or reused without degrading
  // the orientation into Euler angles, which become ambiguous near nadir.
  worldDirection?: Vector3;
  worldUp?: Vector3;
  worldRight?: Vector3;
  worldQuaternion?: Quaternion;
  cartographic: LatLngAlt.rad | null;
  // bearing/pitch/roll are exposed as convenience / interop values only.
  // Consumers should not treat them as the canonical orientation source when a
  // basis/quaternion/cameraModel is present, because near nadir the azimuth can
  // legitimately become unstable or underdefined.
  bearingRad?: number;
  pitchRad?: number;
  rollRad?: number;
  matrixWorld?: Matrix4;
  matrixWorldInverse?: Matrix4;
  basisMatrixWorld?: Matrix4;
};

export type OrbitPoint = {
  worldPosition: Vector3;
  cartographic: LatLngAlt.rad | null;
  source: OrbitPointSource;
};

export const SCENE_STATE_METADATA_SOURCE = {
  FRAMEWORK: "framework",
  HASH: "hash",
  CUSTOM: "custom",
} as const;

export type SceneStateMetadataSource =
  (typeof SCENE_STATE_METADATA_SOURCE)[keyof typeof SCENE_STATE_METADATA_SOURCE];

export type SceneStateMetadata = {
  frameNumber: number | null;
  timestampMs: number;
  source?: SceneStateMetadataSource;
};

export type SceneState = {
  metadata: SceneStateMetadata;
  camera: SceneCamera;
  orbitPoint: OrbitPoint | null;
  lighting?: SceneLighting;
};

export type SceneStateOptions = {
  orbitPointMode?: OrbitPointMode;
  fallbackHeightM?: number;
  screenCenterSamplingStrategy?: OrbitPointSamplingStrategy;
  throwOnMissingScreenCenterIntersection?: boolean;
};
