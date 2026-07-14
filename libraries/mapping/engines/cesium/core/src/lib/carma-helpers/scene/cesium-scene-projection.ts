import {
  Cartesian2,
  Cartesian3,
  SceneTransforms,
  defined,
  type Scene,
} from "@carma-cesium";
import type { CssPixelPosition } from "@carma-units";

import {
  areCameraSnapshotsEqual,
  getCameraSnapshot,
  type CameraSnapshot,
} from "../camera/CameraSnapshot";
import { isPointOccluded } from "./Occlusion";

export type CesiumSceneProjectionState = {
  canvasPosition: Cartesian2 | null;
  screenPosition: CssPixelPosition | null;
  isInViewport: boolean;
  isHidden: boolean;
  isOccluded: boolean;
};

export type CesiumSceneProjectionSnapshot = {
  viewportWidth: number;
  viewportHeight: number;
  cameraSnapshot: CameraSnapshot;
};

export type CesiumSceneProjectionOptions = {
  shouldTestVisibility?: boolean;
  shouldTestOcclusion?: boolean;
  viewportPaddingHorizontal?: number;
  viewportPaddingVertical?: number;
  occlusionToleranceMeters?: number;
};

type SceneProjectionFrameCache = {
  frameKey: number;
  projectionByKey: Map<string, CesiumSceneProjectionState>;
  snapshot: CesiumSceneProjectionSnapshot | null;
};

const projectionFrameCacheByScene = new WeakMap<
  Scene,
  SceneProjectionFrameCache
>();

export const getCesiumSceneFrameKey = (scene: Scene | null): number | null => {
  if (!scene || scene.isDestroyed()) {
    return null;
  }

  const frameNumber = (
    scene as Scene & { frameState?: { frameNumber?: number } }
  ).frameState?.frameNumber;
  return typeof frameNumber === "number" ? frameNumber : 0;
};

const getFrameCache = (scene: Scene) => {
  const frameKey = getCesiumSceneFrameKey(scene) ?? 0;
  const existing = projectionFrameCacheByScene.get(scene);
  if (existing?.frameKey === frameKey) {
    return existing;
  }

  const next: SceneProjectionFrameCache = {
    frameKey,
    projectionByKey: new Map(),
    snapshot: null,
  };
  projectionFrameCacheByScene.set(scene, next);
  return next;
};

export const captureCesiumSceneProjectionSnapshot = (
  scene: Scene | null
): CesiumSceneProjectionSnapshot | null => {
  if (!scene || scene.isDestroyed()) {
    return null;
  }

  const cache = getFrameCache(scene);
  cache.snapshot ??= {
    viewportWidth: Math.max(1, scene.canvas.clientWidth),
    viewportHeight: Math.max(1, scene.canvas.clientHeight),
    cameraSnapshot: getCameraSnapshot(scene),
  };
  return cache.snapshot;
};

export const areCesiumSceneProjectionSnapshotsEqual = (
  left: CesiumSceneProjectionSnapshot | null,
  right: CesiumSceneProjectionSnapshot | null
) => {
  if (!left || !right) {
    return left === right;
  }

  return (
    left.viewportWidth === right.viewportWidth &&
    left.viewportHeight === right.viewportHeight &&
    areCameraSnapshotsEqual(left.cameraSnapshot, right.cameraSnapshot)
  );
};

const isInViewport = (
  point: CssPixelPosition,
  width: number,
  height: number,
  paddingHorizontal: number,
  paddingVertical: number
) =>
  point.x >= -paddingHorizontal &&
  point.y >= -paddingVertical &&
  point.x <= width + paddingHorizontal &&
  point.y <= height + paddingVertical;

export const projectCesiumScenePoint = (
  scene: Scene | null,
  pointECEF: Cartesian3,
  {
    shouldTestVisibility = true,
    shouldTestOcclusion = true,
    viewportPaddingHorizontal = 12,
    viewportPaddingVertical = 8,
    occlusionToleranceMeters = 1,
  }: CesiumSceneProjectionOptions = {}
): CesiumSceneProjectionState => {
  if (!scene || scene.isDestroyed()) {
    return {
      canvasPosition: null,
      screenPosition: null,
      isInViewport: false,
      isHidden: true,
      isOccluded: false,
    };
  }

  const cache = getFrameCache(scene);
  const cacheKey = [
    pointECEF.x,
    pointECEF.y,
    pointECEF.z,
    shouldTestVisibility,
    shouldTestOcclusion,
    viewportPaddingHorizontal,
    viewportPaddingVertical,
    occlusionToleranceMeters,
  ].join(":");
  const cached = cache.projectionByKey.get(cacheKey);
  if (cached) {
    return cached;
  }

  const canvasPosition = SceneTransforms.worldToWindowCoordinates(
    scene,
    pointECEF
  );
  if (!defined(canvasPosition)) {
    const state = {
      canvasPosition: null,
      screenPosition: null,
      isInViewport: false,
      isHidden: shouldTestVisibility,
      isOccluded: false,
    };
    cache.projectionByKey.set(cacheKey, state);
    return state;
  }

  const screenPosition = {
    x: canvasPosition.x,
    y: canvasPosition.y,
  } as CssPixelPosition;
  const pointIsInViewport = isInViewport(
    screenPosition,
    scene.canvas.clientWidth,
    scene.canvas.clientHeight,
    viewportPaddingHorizontal,
    viewportPaddingVertical
  );
  const state = {
    canvasPosition: Cartesian2.clone(canvasPosition),
    screenPosition,
    isInViewport: pointIsInViewport,
    isHidden: shouldTestVisibility ? !pointIsInViewport : false,
    isOccluded:
      shouldTestOcclusion && pointIsInViewport
        ? isPointOccluded(
            scene,
            pointECEF,
            canvasPosition,
            occlusionToleranceMeters
          )
        : false,
  };
  cache.projectionByKey.set(cacheKey, state);
  return state;
};
