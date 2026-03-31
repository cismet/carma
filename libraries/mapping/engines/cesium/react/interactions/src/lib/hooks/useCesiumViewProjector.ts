import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  Cartesian2,
  Cartesian3,
  Matrix4,
  SceneTransforms,
  defined,
  type Scene,
  type Cartesian3Json,
  type Matrix4ConstructorArgs,
} from "@carma/cesium";
import type { CssPixelPosition } from "@carma/units/types";
const WORLD_POINT_SCRATCH = new Cartesian3();

type ProjectedScreenPositionCacheEntry = {
  frameNumber: number;
  pointX: number;
  pointY: number;
  pointZ: number;
  screenPosition: CssPixelPosition | null;
};

type SceneFrameStateLike = {
  frameState?: { frameNumber?: number };
};

type CesiumViewProjectorState = {
  width: number;
  height: number;
  displayWidth: number;
  displayHeight: number;
  cameraPitch: number;
  frameNumber: number | null;
};

type CachedCesiumViewProjectorSnapshot = {
  frameNumber: number | null;
  refreshedForFrame: boolean;
  latestViewState: CesiumViewProjectorState | null;
  hasViewProjectionMatrix: boolean;
  viewProjectionScratch: Matrix4;
  viewProjectionMatrix: Matrix4ConstructorArgs;
  projectedScreenPositionByPoint: WeakMap<
    object,
    ProjectedScreenPositionCacheEntry
  >;
  windowCoordinateScratch: Cartesian2;
};

const cachedCesiumViewProjectorSnapshots = new WeakMap<
  Scene,
  CachedCesiumViewProjectorSnapshot
>();

const readSceneFrameNumber = (scene: SceneFrameStateLike): number | null => {
  const frameNumber = scene.frameState?.frameNumber;
  return typeof frameNumber === "number" && Number.isFinite(frameNumber)
    ? frameNumber
    : null;
};

const readOrCreateCachedSnapshot = (
  scene: Scene
): CachedCesiumViewProjectorSnapshot => {
  const frameNumber = readSceneFrameNumber(scene as SceneFrameStateLike);
  const existingSnapshot = cachedCesiumViewProjectorSnapshots.get(scene);

  if (!existingSnapshot) {
    const initialSnapshot: CachedCesiumViewProjectorSnapshot = {
      frameNumber,
      refreshedForFrame: false,
      latestViewState: null,
      hasViewProjectionMatrix: false,
      viewProjectionScratch: new Matrix4(),
      viewProjectionMatrix: new Array<number>(16).fill(
        0
      ) as Matrix4ConstructorArgs,
      projectedScreenPositionByPoint: new WeakMap(),
      windowCoordinateScratch: new Cartesian2(),
    };
    cachedCesiumViewProjectorSnapshots.set(scene, initialSnapshot);
    return initialSnapshot;
  }

  if (existingSnapshot.frameNumber !== frameNumber) {
    existingSnapshot.frameNumber = frameNumber;
    existingSnapshot.refreshedForFrame = false;
    existingSnapshot.latestViewState = null;
    existingSnapshot.hasViewProjectionMatrix = false;
    existingSnapshot.projectedScreenPositionByPoint = new WeakMap();
  }

  return existingSnapshot;
};

const refreshCachedSnapshot = (
  scene: Scene
): CachedCesiumViewProjectorSnapshot => {
  const cachedSnapshot = readOrCreateCachedSnapshot(scene);
  if (cachedSnapshot.refreshedForFrame) {
    return cachedSnapshot;
  }

  const frameNumber = readSceneFrameNumber(scene as SceneFrameStateLike);
  cachedSnapshot.latestViewState = {
    width: Math.max(1, scene.canvas.clientWidth || scene.canvas.width || 1),
    height: Math.max(1, scene.canvas.clientHeight || scene.canvas.height || 1),
    displayWidth: Math.max(
      1,
      scene.drawingBufferWidth || scene.canvas.width || 1
    ),
    displayHeight: Math.max(
      1,
      scene.drawingBufferHeight || scene.canvas.height || 1
    ),
    cameraPitch: scene.camera.pitch,
    frameNumber,
  };

  const viewProjectionMatrix = Matrix4.multiply(
    scene.camera.frustum.projectionMatrix,
    scene.camera.viewMatrix,
    cachedSnapshot.viewProjectionScratch
  );
  Matrix4.toArray(viewProjectionMatrix, cachedSnapshot.viewProjectionMatrix);
  cachedSnapshot.hasViewProjectionMatrix = true;
  cachedSnapshot.refreshedForFrame = true;

  return cachedSnapshot;
};

const readCachedProjectedScreenPosition = (
  scene: Scene,
  point: Cartesian3Json,
  cachedSnapshot: CachedCesiumViewProjectorSnapshot
): CssPixelPosition | null => {
  const frameNumber = cachedSnapshot.frameNumber;
  const cacheKey = point as object;
  const cachedEntry =
    frameNumber !== null
      ? cachedSnapshot.projectedScreenPositionByPoint.get(cacheKey)
      : undefined;

  if (
    cachedEntry &&
    cachedEntry.frameNumber === frameNumber &&
    cachedEntry.pointX === point.x &&
    cachedEntry.pointY === point.y &&
    cachedEntry.pointZ === point.z
  ) {
    return cachedEntry.screenPosition;
  }

  const worldPoint = Cartesian3.fromElements(
    point.x,
    point.y,
    point.z,
    WORLD_POINT_SCRATCH
  );

  const screen = SceneTransforms.worldToWindowCoordinates(
    scene,
    worldPoint,
    cachedSnapshot.windowCoordinateScratch
  );
  const screenPosition =
    defined(screen) && Number.isFinite(screen.x) && Number.isFinite(screen.y)
      ? ({ x: screen.x, y: screen.y } as CssPixelPosition)
      : null;

  if (frameNumber !== null) {
    cachedSnapshot.projectedScreenPositionByPoint.set(cacheKey, {
      frameNumber,
      pointX: point.x,
      pointY: point.y,
      pointZ: point.z,
      screenPosition,
    });
  }

  return screenPosition;
};

export const useCesiumViewProjector = (scene: Scene | null) => {
  const latestViewStateRef = useRef<CesiumViewProjectorState | null>(null);
  const hasViewProjectionMatrixRef = useRef(false);

  const updateSnapshot = useCallback(() => {
    if (!scene || scene.isDestroyed()) {
      latestViewStateRef.current = null;
      hasViewProjectionMatrixRef.current = false;
      return;
    }

    const cachedSnapshot = refreshCachedSnapshot(scene);
    latestViewStateRef.current = cachedSnapshot.latestViewState;
    hasViewProjectionMatrixRef.current = cachedSnapshot.hasViewProjectionMatrix;
  }, [scene]);

  useEffect(() => {
    updateSnapshot();

    if (!scene || scene.isDestroyed()) {
      return;
    }

    const removePreRenderListener =
      scene.preRender.addEventListener(updateSnapshot);

    return () => {
      removePreRenderListener?.();
      latestViewStateRef.current = null;
      hasViewProjectionMatrixRef.current = false;
    };
  }, [scene, updateSnapshot]);

  const getViewState = useCallback(() => {
    if (!scene || scene.isDestroyed()) return null;
    if (!latestViewStateRef.current) {
      updateSnapshot();
    }

    return latestViewStateRef.current;
  }, [scene, updateSnapshot]);

  const getViewProjectionMatrix = useCallback(() => {
    if (!scene || scene.isDestroyed()) return null;
    if (!hasViewProjectionMatrixRef.current) {
      updateSnapshot();
    }

    if (!hasViewProjectionMatrixRef.current) {
      return null;
    }

    return refreshCachedSnapshot(scene).viewProjectionMatrix;
  }, [scene, updateSnapshot]);

  const projectWorldToScreen = useCallback(
    (point: Cartesian3Json) => {
      if (!scene || scene.isDestroyed()) return null;
      const cachedSnapshot = refreshCachedSnapshot(scene);
      return readCachedProjectedScreenPosition(scene, point, cachedSnapshot);
    },
    [scene]
  );

  return useMemo(
    () => ({
      getViewState,
      getViewProjectionMatrix,
      projectWorldToScreen,
    }),
    [getViewState, getViewProjectionMatrix, projectWorldToScreen]
  );
};
