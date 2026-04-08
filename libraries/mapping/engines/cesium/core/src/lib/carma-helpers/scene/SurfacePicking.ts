import {
  Cesium3DTileset,
  Cartesian2,
  Cartesian3,
  type Scene,
} from "@carma-cesium";
import { warnOnce } from "@carma-commons/utils";

import { pickGlobePositionAtScreenPosition } from "./Picking";

type SceneWithFrameState = Scene & {
  frameState?: {
    frameNumber?: number;
  };
};

type SurfacePickingTilesetWithPick = {
  isDestroyed(): boolean;
  pick(
    ray: object,
    frameState: object,
    result?: Cartesian3
  ): Cartesian3 | undefined;
};

export type ResolvedSurfacePick = {
  surfacePositionECEF: Cartesian3 | null;
  globePositionECEF: Cartesian3 | null;
};

export type ResolveSurfacePickOptions = {
  resolveGlobePosition?: boolean;
};

type SurfacePickingFrameCache = {
  frameNumber: number | null;
  surfacePickByScreenKey: Map<string, Cartesian3 | null>;
  globePickByScreenKey: Map<string, Cartesian3 | null>;
};

const surfacePickingTilesetByScene = new WeakMap<Scene, Cesium3DTileset>();
const surfacePickingFrameCacheByScene = new WeakMap<
  Scene,
  SurfacePickingFrameCache
>();
const SURFACE_PICKING_WARN_PREFIX = "[CESIUM|SURFACE_PICKING]";

const isUsablePickPosition = (
  positionECEF: Cartesian3 | null
): positionECEF is Cartesian3 =>
  Boolean(
    positionECEF &&
      Number.isFinite(positionECEF.x) &&
      Number.isFinite(positionECEF.y) &&
      Number.isFinite(positionECEF.z)
  );

const isUsableSurfacePickingTileset = (
  tileset: Cesium3DTileset | null | undefined
): tileset is Cesium3DTileset =>
  Boolean(tileset && typeof tileset.isDestroyed === "function") &&
  tileset.isDestroyed() === false;

const readSceneFrameNumber = (scene: SceneWithFrameState): number | null => {
  const frameNumber = scene.frameState?.frameNumber;
  return typeof frameNumber === "number" && Number.isFinite(frameNumber)
    ? frameNumber
    : null;
};

const readOrCreateSurfacePickingFrameCache = (
  scene: Scene
): SurfacePickingFrameCache => {
  const frameNumber = readSceneFrameNumber(scene as SceneWithFrameState);
  const existingCache = surfacePickingFrameCacheByScene.get(scene);
  if (!existingCache) {
    const initialCache: SurfacePickingFrameCache = {
      frameNumber,
      surfacePickByScreenKey: new Map(),
      globePickByScreenKey: new Map(),
    };
    surfacePickingFrameCacheByScene.set(scene, initialCache);
    return initialCache;
  }

  if (existingCache.frameNumber !== frameNumber) {
    existingCache.frameNumber = frameNumber;
    existingCache.surfacePickByScreenKey.clear();
    existingCache.globePickByScreenKey.clear();
  }

  return existingCache;
};

const toScreenKey = (screenPosition: Cartesian2) =>
  `${screenPosition.x}:${screenPosition.y}`;

const resolveSurfaceTilesetPickAtScreenPosition = (
  scene: Scene,
  screenPosition: Cartesian2
): Cartesian3 | null => {
  const frameCache = readOrCreateSurfacePickingFrameCache(scene);
  const screenKey = toScreenKey(screenPosition);
  if (frameCache.surfacePickByScreenKey.has(screenKey)) {
    return frameCache.surfacePickByScreenKey.get(screenKey) ?? null;
  }

  const surfaceTileset = getCesiumSceneSurfacePickingTileset(scene);
  if (!surfaceTileset) {
    warnOnce(
      `${SURFACE_PICKING_WARN_PREFIX} No surface-picking tileset is registered for this scene.`
    );
    frameCache.surfacePickByScreenKey.set(screenKey, null);
    return null;
  }

  const pickRay = scene.camera.getPickRay(screenPosition);
  const frameState = (scene as SceneWithFrameState).frameState;
  if (!pickRay) {
    warnOnce(
      `${SURFACE_PICKING_WARN_PREFIX} camera.getPickRay(...) returned null while resolving a surface pick.`
    );
    frameCache.surfacePickByScreenKey.set(screenKey, null);
    return null;
  }

  if (!frameState) {
    warnOnce(
      `${SURFACE_PICKING_WARN_PREFIX} scene.frameState is unavailable while resolving a surface pick.`
    );
    frameCache.surfacePickByScreenKey.set(screenKey, null);
    return null;
  }

  const pickedPosition = (
    surfaceTileset as unknown as SurfacePickingTilesetWithPick
  ).pick(pickRay, frameState, new Cartesian3());

  const resolvedPosition = isUsablePickPosition(pickedPosition)
    ? pickedPosition
    : null;
  frameCache.surfacePickByScreenKey.set(screenKey, resolvedPosition);
  return resolvedPosition;
};

export const registerCesiumSceneSurfacePickingTileset = (
  scene: Scene,
  tileset: Cesium3DTileset
) => {
  surfacePickingTilesetByScene.set(scene, tileset);

  return () => {
    if (surfacePickingTilesetByScene.get(scene) !== tileset) {
      return;
    }

    surfacePickingTilesetByScene.delete(scene);
  };
};

export const clearCesiumSceneSurfacePickingTileset = (scene: Scene) => {
  surfacePickingTilesetByScene.delete(scene);
};

export const getCesiumSceneSurfacePickingTileset = (scene: Scene) => {
  const tileset = surfacePickingTilesetByScene.get(scene);
  if (!isUsableSurfacePickingTileset(tileset)) {
    surfacePickingTilesetByScene.delete(scene);
    return null;
  }

  return tileset;
};

export const resolvePreferredSurfacePick = (
  scene: Scene,
  screenPosition: Cartesian2,
  { resolveGlobePosition = true }: ResolveSurfacePickOptions = {}
): ResolvedSurfacePick => {
  const frameCache = readOrCreateSurfacePickingFrameCache(scene);
  const screenKey = toScreenKey(screenPosition);
  const surfacePositionECEF = resolveSurfaceTilesetPickAtScreenPosition(
    scene,
    screenPosition
  );
  const globePositionECEF = resolveGlobePosition
    ? frameCache.globePickByScreenKey.has(screenKey)
      ? frameCache.globePickByScreenKey.get(screenKey) ?? null
      : (() => {
          const resolvedGlobePosition = pickGlobePositionAtScreenPosition(
            scene,
            screenPosition
          );
          frameCache.globePickByScreenKey.set(screenKey, resolvedGlobePosition);
          return resolvedGlobePosition;
        })()
    : null;

  if (!surfacePositionECEF && !globePositionECEF && resolveGlobePosition) {
    warnOnce(
      `${SURFACE_PICKING_WARN_PREFIX} Surface pick and globe fallback both missed at least once.`
    );
  }

  return {
    surfacePositionECEF,
    globePositionECEF,
  };
};
