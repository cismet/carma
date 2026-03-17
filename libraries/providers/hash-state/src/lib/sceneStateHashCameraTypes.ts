export type CartographicLike = {
  longitude: number;
  latitude: number;
  height: number;
};

export type CameraLike = {
  positionCartographic?: CartographicLike;
  heading?: number;
  pitch?: number;
  roll?: number;
  frustum?: { fov?: number; fovy?: number } | null;
  getPickRay?: (windowPosition: { x: number; y: number }) => unknown;
};

export type SceneLike = {
  camera?: CameraLike;
  canvas?: { clientWidth: number; clientHeight: number };
  pickPositionSupported?: boolean;
  pickPosition?: (windowPosition: { x: number; y: number }) => unknown;
  globe?: {
    pick?: (ray: unknown, scene: SceneLike) => unknown;
    ellipsoid?: {
      cartesianToCartographic?: (
        cartesian: unknown
      ) => CartographicLike | undefined | null;
    };
  };
};

export type SceneStateCameraLike = CameraLike;
export type SceneStateLike = SceneLike;
