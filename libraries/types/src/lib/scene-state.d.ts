import type {
  CameraType,
  CameraView,
  ObjectCentricCameraModel,
} from "@carma-commons/camera/model";
import type {
  Mat4 as MathMat4,
  Quat as MathQuat,
  Vec2 as MathVec2,
  Vec3 as MathVec3,
} from "@carma/math";
import type { LatLngAlt } from "@carma/geo/types";
import type { CssPixels } from "@carma/units/types";

export type Vec2 = MathVec2;
export type Vec3 = MathVec3;
export type Mat4 = MathMat4;
export type Quat = MathQuat;
export type RayLike = {
  origin?: Vec3;
  direction?: Vec3;
};
export type Matrix4Like = Mat4 | ArrayLike<number> | Record<number, number>;
export type FrustumLike = {
  fov?: number;
  fovVertical?: number;
  fovHorizontal?: number;
  aspect?: number;
  aspectRatio?: number;
  zoom?: number;
  near?: number;
  nearPlane?: number;
  far?: number;
  farPlane?: number;
  focus?: number;
  filmGauge?: number;
  filmOffset?: number;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  type?: CameraType;
  projectionMode?: "perspective" | "orthographic";
  projectionMatrix?: Matrix4Like;
  projectionMatrixInverse?: Matrix4Like;
  view?: CameraView;
  viewOffset?: {
    enabled?: boolean;
    fullWidthPx: number;
    fullHeightPx: number;
    offsetXPx: number;
    offsetYPx: number;
    widthPx: number;
    heightPx: number;
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

export type SceneColorSnapshot = {
  red: number;
  green: number;
  blue: number;
  alpha?: number;
};

export type SceneDirectionalLightSnapshot = {
  source?: string;
  directionWorld?: Vec3;
  positionWorld?: Vec3;
  color?: SceneColorSnapshot;
  intensity?: number;
};

export type SceneLightingSnapshot = {
  mainDirectionalLight?: SceneDirectionalLightSnapshot;
};

export type SceneCameraSnapshot = {
  cameraModel?: ObjectCentricCameraModel;
  worldPosition: Vec3;
  // These world-space basis vectors / quaternion are the most stable camera
  // attitude snapshot. They can be compared or reused without degrading the
  // orientation into Euler angles, which become ambiguous near nadir.
  worldDirection?: Vec3;
  worldUp?: Vec3;
  worldRight?: Vec3;
  worldQuaternion?: Quat;
  cartographic: LatLngAlt.rad | null;
  // bearing/pitch/roll are exposed as convenience / interop values only.
  // Consumers should not treat them as the canonical orientation source when a
  // basis/quaternion/cameraModel is present, because near nadir the azimuth can
  // legitimately become unstable or underdefined.
  bearingRad?: number;
  pitchRad?: number;
  rollRad?: number;
  matrixWorld?: Mat4;
  matrixWorldInverse?: Mat4;
  basisMatrixWorld?: Mat4;
  projectionMatrix?: Mat4;
  projectionMatrixInverse?: Mat4;
  fovVertical?: number;
  fovHorizontal?: number;
  aspect?: number;
  aspectRatio?: number;
  zoom?: number;
  near?: number;
  nearPlane?: number;
  far?: number;
  farPlane?: number;
  focus?: number;
  filmGauge?: number;
  filmOffset?: number;
  focalLength?: number;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  imageWidthPx?: CssPixels;
  imageHeightPx?: CssPixels;
  principalPointPx?: MathVec2;
  sensorSize?: MathVec2;
  type?: CameraType;
  view?: CameraView;
  viewMatrix?: Mat4;
  inverseViewMatrix?: Mat4;
};

export type OrbitPointSnapshot = {
  worldPosition: Vec3;
  cartographic: LatLngAlt.rad | null;
  source: OrbitPointSource;
};

export type SceneStateSnapshot = {
  frameNumber: number | null;
  timestampMs: number;
  camera: SceneCameraSnapshot;
  orbitPoint: OrbitPointSnapshot | null;
  lighting?: SceneLightingSnapshot;
};

export type SceneStateOptions = {
  orbitPointMode?: OrbitPointMode;
  fallbackHeightM?: number;
  screenCenterSamplingStrategy?: OrbitPointSamplingStrategy;
  throwOnMissingScreenCenterIntersection?: boolean;
};

export type EventLike = {
  addEventListener: (listener: () => void) => void;
  removeEventListener: (listener: () => void) => void;
};

export type CameraLike = {
  positionWC?: Vec3;
  position?: Vec3;
  directionWC?: Vec3;
  upWC?: Vec3;
  rightWC?: Vec3;
  positionCartographic?: LatLngAlt.rad;
  heading?: number;
  pitch?: number;
  roll?: number;
  viewMatrix?: Matrix4Like;
  inverseViewMatrix?: Matrix4Like;
  frustum?: FrustumLike;
  getPickRay?: (windowPosition: Vec2) => RayLike | null | undefined;
};

export type LightLike = {
  direction?: Vec3;
  color?:
    | SceneColorSnapshot
    | {
        r?: number;
        g?: number;
        b?: number;
        a?: number;
      };
  intensity?: number;
};

export type SceneLike = {
  camera?: CameraLike;
  light?: LightLike;
  canvas?: {
    clientWidth: number;
    clientHeight: number;
  };
  frameState?: { frameNumber?: number };
  preRender?: EventLike;
  postRender?: EventLike;
  pickPositionSupported?: boolean;
  pickPosition?: (windowPosition: Vec2) => Vec3 | null | undefined;
  globe?: {
    pick?: (ray: RayLike, scene: SceneLike) => Vec3 | null | undefined;
    ellipsoid?: {
      cartesianToCartographic?: (cartesian: Vec3) => LatLngAlt.rad | null;
      cartographicToCartesian?: (
        cartographic: LatLngAlt.rad
      ) => Vec3 | null | undefined;
    };
  };
};
