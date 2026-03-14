// Intentionally tied to three.js Matrix4:
// CARMA uses Matrix4 as a native cross-library 3D matrix type.
import type { LatLngAlt } from "@carma/geo/types";
import type { Matrix4 } from "three";

export type Vec3 = {
  x: number;
  y: number;
  z: number;
};
export type Mat4 = Matrix4;
export type Vec2 = {
  x: number;
  y: number;
};
export type RayLike = {
  origin?: Vec3;
  direction?: Vec3;
};
export type Matrix4Like = Mat4 | ArrayLike<number> | Record<number, number>;
export type FrustumLike = {
  fov?: number;
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

export type SceneCameraSnapshot = {
  worldPosition: Vec3;
  cartographic: LatLngAlt.rad | null;
  headingRad?: number;
  pitchRad?: number;
  rollRad?: number;
  fovRad?: number;
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
  positionCartographic?: LatLngAlt.rad;
  heading?: number;
  pitch?: number;
  roll?: number;
  viewMatrix?: Matrix4Like;
  inverseViewMatrix?: Matrix4Like;
  frustum?: FrustumLike;
  getPickRay?: (windowPosition: Vec2) => RayLike | null | undefined;
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
