export type EventLike = {
  addEventListener: (listener: () => void) => void;
  removeEventListener: (listener: () => void) => void;
};

import type {
  Matrix4Like,
  Matrix4,
  Quaternion,
  RayLike,
  Vector2,
  Vector3,
} from "@carma/math";
import type { LatLngAlt } from "@carma/geo/types";
import type { Meters, Radians } from "@carma/units/types";

export type CameraType = "PerspectiveCamera" | "OrthographicCamera";

export type CameraFrustum = {
  near?: Meters;
  far?: Meters;
} & Record<string, unknown>;

export type CameraIntrinsics = {
  type?: CameraType;
  projectionMatrix?: Matrix4;
  fov?: Radians;
  fovHorizontal?: Radians;
  frustum?: CameraFrustum;
};

export type CameraBasis = {
  direction: Vector3;
  up: Vector3;
  right?: Vector3;
};

export type ObjectCentricCameraAnchor = LatLngAlt.rad & {
  altitude: NonNullable<LatLngAlt.rad["altitude"]>;
};

export type ObjectCentricCameraPose = {
  anchor: ObjectCentricCameraAnchor;
  bearing: Radians;
  pitch: Radians;
  roll?: Radians;
  range: Meters;
  matrixWorld?: Matrix4;
  matrixWorldInverse?: Matrix4;
  basisMatrix?: Matrix4;
  position?: Vector3;
  direction?: Vector3;
  up?: Vector3;
  right?: Vector3;
  quaternion?: Quaternion;
  basis?: CameraBasis;
};

export type ObjectCentricCameraModel = {
  pose: ObjectCentricCameraPose;
  intrinsics?: CameraIntrinsics;
};

export type FrustumLike = {
  fov?: number;
  fovy?: number;
  aspectRatio?: number;
  near?: number;
  far?: number;
  width?: number;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  projectionMatrix?: Matrix4Like;
};


export type CameraLike = {
  positionWC?: Vector3;
  position?: Vector3;
  directionWC?: Vector3;
  upWC?: Vector3;
  rightWC?: Vector3;
  positionCartographic?: LatLngAlt.rad;
  heading?: number;
  pitch?: number;
  roll?: number;
  viewMatrix?: Matrix4Like;
  inverseViewMatrix?: Matrix4Like;
  frustum?: FrustumLike;
  getPickRay?: (windowPosition: Vector2) => RayLike | null | undefined;
};

export type SceneLike = {
  camera?: CameraLike;
  canvas?: {
    clientWidth: number;
    clientHeight: number;
  };
  frameState?: { frameNumber?: number };
  preRender?: EventLike;
  postRender?: EventLike;
  pickPositionSupported?: boolean;
  pickPosition?: (windowPosition: Vector2) => Vector3 | null | undefined;
  globe?: {
    pick?: (ray: RayLike, scene: SceneLike) => Vector3 | null | undefined;
    ellipsoid?: {
      cartesianToCartographic?: (cartesian: Vector3) => LatLngAlt.rad | null;
      cartographicToCartesian?: (
        cartographic: LatLngAlt.rad
      ) => Vector3 | null | undefined;
    };
  };
};

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
  worldDirection?: Vector3;
  worldUp?: Vector3;
  worldRight?: Vector3;
  worldQuaternion?: Quaternion;
  cartographic: LatLngAlt.rad | null;
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
