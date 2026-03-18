import type { LatLngAlt } from "@carma/geo/types";

export type CameraLike = {
  positionCartographic?: LatLngAlt.rad;
  heading?: number;
  pitch?: number;
  roll?: number;
  frustum?: { fov?: number; fovy?: number } | null;
  getPickRay?: (windowPosition: unknown) => unknown;
};

export type SceneLike = {
  camera?: CameraLike;
  canvas?: { clientWidth: number; clientHeight: number };
  pickPositionSupported?: boolean;
  pickPosition?: (windowPosition: unknown) => unknown;
  globe?: {
    pick?: (ray: unknown, scene: SceneLike) => unknown;
    ellipsoid?: {
      cartesianToCartographic?: (
        cartesian: unknown
      ) => LatLngAlt.rad | undefined | null;
    };
  };
};
