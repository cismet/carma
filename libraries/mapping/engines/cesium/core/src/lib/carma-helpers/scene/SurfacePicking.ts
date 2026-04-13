import { Cartesian2, Cartesian3, type Scene } from "@carma-cesium";
import { warnOnce } from "@carma-commons/utils";

import {
  pickGlobePositionAtScreenPosition,
  pickScenePositionAtScreenPosition,
} from "./Picking";

type SceneWithFrameState = Scene & {
  frameState?: {
    frameNumber?: number;
  };
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

const isDepthPickingSupported = (
  scene: Scene & {
    pickPositionSupported?: boolean;
    pickPosition?: (
      screenPosition: Cartesian2
    ) => Cartesian3 | null | undefined;
  }
) =>
  scene.pickPositionSupported === true &&
  typeof scene.pickPosition === "function";

const resolveSurfaceDepthPickAtScreenPosition = (
  scene: Scene,
  screenPosition: Cartesian2
): Cartesian3 | null => {
  const frameCache = readOrCreateSurfacePickingFrameCache(scene);
  const screenKey = toScreenKey(screenPosition);
  if (frameCache.surfacePickByScreenKey.has(screenKey)) {
    return frameCache.surfacePickByScreenKey.get(screenKey) ?? null;
  }

  if (!isDepthPickingSupported(scene)) {
    warnOnce(
      `${SURFACE_PICKING_WARN_PREFIX} scene.pickPosition(...) is unavailable or unsupported while resolving a surface pick.`
    );
    frameCache.surfacePickByScreenKey.set(screenKey, null);
    return null;
  }

  const pickedPosition = pickScenePositionAtScreenPosition(
    scene,
    screenPosition
  );

  const resolvedPosition = isUsablePickPosition(pickedPosition)
    ? pickedPosition
    : null;
  frameCache.surfacePickByScreenKey.set(screenKey, resolvedPosition);
  return resolvedPosition;
};

export const resolvePreferredSurfacePick = (
  scene: Scene,
  screenPosition: Cartesian2,
  { resolveGlobePosition = true }: ResolveSurfacePickOptions = {}
): ResolvedSurfacePick => {
  const frameCache = readOrCreateSurfacePickingFrameCache(scene);
  const screenKey = toScreenKey(screenPosition);
  const surfacePositionECEF = resolveSurfaceDepthPickAtScreenPosition(
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
      `${SURFACE_PICKING_WARN_PREFIX} Depth-based surface pick and globe fallback both missed at least once.`
    );
  }

  return {
    surfacePositionECEF,
    globePositionECEF,
  };
};
