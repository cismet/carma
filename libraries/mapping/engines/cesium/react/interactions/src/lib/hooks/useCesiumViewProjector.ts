import { useCallback, useEffect, useMemo, useRef } from "react";

import {
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
  const frameNumber = readSceneFrameNumber(scene);
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
    };
    cachedCesiumViewProjectorSnapshots.set(scene, initialSnapshot);
    return initialSnapshot;
  }

  if (existingSnapshot.frameNumber !== frameNumber) {
    existingSnapshot.frameNumber = frameNumber;
    existingSnapshot.refreshedForFrame = false;
    existingSnapshot.latestViewState = null;
    existingSnapshot.hasViewProjectionMatrix = false;
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

  const frameNumber = readSceneFrameNumber(scene);
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
      const worldPoint = Cartesian3.fromElements(
        point.x,
        point.y,
        point.z,
        WORLD_POINT_SCRATCH
      );

      const screen = SceneTransforms.worldToWindowCoordinates(
        scene,
        worldPoint
      );
      if (!defined(screen)) return null;
      if (!Number.isFinite(screen.x) || !Number.isFinite(screen.y)) {
        return null;
      }

      return {
        x: screen.x,
        y: screen.y,
      } as CssPixelPosition;
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
