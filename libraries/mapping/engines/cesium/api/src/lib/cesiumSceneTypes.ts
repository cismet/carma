import type {
  Cartesian2,
  Cartesian3,
  Matrix4,
  Quaternion,
  Ray,
} from "./cesium";
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
  direction: Cartesian3;
  up: Cartesian3;
  right?: Cartesian3;
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
  position?: Cartesian3;
  direction?: Cartesian3;
  up?: Cartesian3;
  right?: Cartesian3;
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
  projectionMatrix?: Matrix4;
};

export type EventLike = {
  addEventListener: (...args: any[]) => void;
  removeEventListener: (...args: any[]) => void;
};

export type CameraLike = {
  positionWC?: Cartesian3;
  position?: Cartesian3;
  directionWC?: Cartesian3;
  upWC?: Cartesian3;
  rightWC?: Cartesian3;
  positionCartographic?: LatLngAlt.rad;
  heading?: number;
  pitch?: number;
  roll?: number;
  changed?: EventLike;
  moveStart?: EventLike;
  moveEnd?: EventLike;
  viewMatrix?: Matrix4;
  inverseViewMatrix?: Matrix4;
  frustum?: FrustumLike;
  getPickRay?: (windowPosition: Cartesian2) => Ray | null | undefined;
};

export type SceneLike = {
  camera?: CameraLike;
  canvas?: {
    clientWidth: number;
    clientHeight: number;
  };
  frameState?: { frameNumber?: number };
  morphComplete?: EventLike;
  preRender?: EventLike;
  postRender?: EventLike;
  pickPositionSupported?: boolean;
  pickPosition?: (windowPosition: Cartesian2) => Cartesian3 | null | undefined;
  globe?: {
    pick?: (ray: Ray, scene: SceneLike) => Cartesian3 | null | undefined;
    ellipsoid?: {
      cartesianToCartographic?: (cartesian: Cartesian3) => LatLngAlt.rad | null;
      cartographicToCartesian?: (
        cartographic: LatLngAlt.rad
      ) => Cartesian3 | null | undefined;
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
  sunPositionWorld?: Cartesian3;
};

export type SceneCamera = {
  cameraModel?: ObjectCentricCameraModel;
  worldPosition: Cartesian3;
  worldDirection?: Cartesian3;
  worldUp?: Cartesian3;
  worldRight?: Cartesian3;
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
  worldPosition: Cartesian3;
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
