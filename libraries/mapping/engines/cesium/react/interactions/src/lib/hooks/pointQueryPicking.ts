import { Cartesian2, Cartesian3, type Scene } from "@carma-cesium";
import {
  GUIDE_NORMAL_EPSILON_SQUARED,
  getLocalUpDirectionAtPosition,
  pickGlobePositionAtScreenPosition,
} from "@carma-mapping/engines/cesium/core";

import { getCesiumScenePointQueryTileset } from "./pointQueryTileset";

const POINTER_NORMAL_SAMPLE_OFFSET_PX = 2;
const OFFSET_SCREEN_POSITION_SCRATCH = new Cartesian2();

type SceneWithFrameState = Scene & {
  frameState?: {
    frameNumber?: number;
  };
};

type PointQueryTilesetWithPick = {
  isDestroyed(): boolean;
  pick(
    ray: object,
    frameState: object,
    result?: Cartesian3
  ): Cartesian3 | undefined;
};

export type ResolvedPointQueryPick = {
  pickedPositionECEF: Cartesian3 | null;
  scenePositionECEF: Cartesian3 | null;
  globePositionECEF: Cartesian3 | null;
};

export type ResolvePointQueryPickOptions = {
  resolveGlobePosition?: boolean;
};

export type SamplePointQuerySurfaceNormalOptions = {
  previousSurfaceNormalECEF?: Cartesian3 | null;
};

type PointQueryFrameCache = {
  frameNumber: number | null;
  primaryPickByScreenKey: Map<string, Cartesian3 | null>;
  globePickByScreenKey: Map<string, Cartesian3 | null>;
};

const pointQueryFrameCacheByScene = new WeakMap<Scene, PointQueryFrameCache>();

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

const readOrCreatePointQueryFrameCache = (
  scene: Scene
): PointQueryFrameCache => {
  const frameNumber = readSceneFrameNumber(scene as SceneWithFrameState);
  const existingCache = pointQueryFrameCacheByScene.get(scene);
  if (!existingCache) {
    const initialCache: PointQueryFrameCache = {
      frameNumber,
      primaryPickByScreenKey: new Map(),
      globePickByScreenKey: new Map(),
    };
    pointQueryFrameCacheByScene.set(scene, initialCache);
    return initialCache;
  }

  if (existingCache.frameNumber !== frameNumber) {
    existingCache.frameNumber = frameNumber;
    existingCache.primaryPickByScreenKey.clear();
    existingCache.globePickByScreenKey.clear();
  }

  return existingCache;
};

const toScreenKey = (screenPosition: Cartesian2) =>
  `${screenPosition.x}:${screenPosition.y}`;

const offsetScreenPosition = (
  screenPosition: Cartesian2,
  offsetX: number,
  offsetY: number,
  result: Cartesian2
) => {
  result.x = screenPosition.x + offsetX;
  result.y = screenPosition.y + offsetY;
  return result;
};

const pickPrimaryTilesetPositionAtScreenPosition = (
  scene: Scene,
  screenPosition: Cartesian2
): Cartesian3 | null => {
  const frameCache = readOrCreatePointQueryFrameCache(scene);
  const screenKey = toScreenKey(screenPosition);
  if (frameCache.primaryPickByScreenKey.has(screenKey)) {
    return frameCache.primaryPickByScreenKey.get(screenKey) ?? null;
  }

  const queryTileset = getCesiumScenePointQueryTileset(scene);
  if (!queryTileset) {
    frameCache.primaryPickByScreenKey.set(screenKey, null);
    return null;
  }

  const pickRay = scene.camera.getPickRay(screenPosition);
  const frameState = (scene as SceneWithFrameState).frameState;
  if (!pickRay || !frameState) {
    frameCache.primaryPickByScreenKey.set(screenKey, null);
    return null;
  }

  const pickedPosition = (queryTileset as unknown as PointQueryTilesetWithPick).pick(
    pickRay,
    frameState,
    new Cartesian3()
  );

  const resolvedPosition = isUsablePickPosition(pickedPosition)
    ? pickedPosition
    : null;
  frameCache.primaryPickByScreenKey.set(screenKey, resolvedPosition);
  return resolvedPosition;
};

const resolveScreenSpaceTangent = (
  centerPosition: Cartesian3,
  positiveDirectionPosition: Cartesian3 | null,
  negativeDirectionPosition: Cartesian3 | null
) => {
  const tangent = new Cartesian3();

  if (positiveDirectionPosition && negativeDirectionPosition) {
    return Cartesian3.subtract(
      positiveDirectionPosition,
      negativeDirectionPosition,
      tangent
    );
  }

  if (positiveDirectionPosition) {
    return Cartesian3.subtract(
      positiveDirectionPosition,
      centerPosition,
      tangent
    );
  }

  if (negativeDirectionPosition) {
    return Cartesian3.subtract(
      centerPosition,
      negativeDirectionPosition,
      tangent
    );
  }

  return null;
};

const resolveStableSurfaceNormal = (
  centerPosition: Cartesian3,
  tangentX: Cartesian3 | null,
  tangentY: Cartesian3 | null,
  previousSurfaceNormalECEF?: Cartesian3 | null
) => {
  if (
    !tangentX ||
    !tangentY ||
    Cartesian3.magnitudeSquared(tangentX) <= GUIDE_NORMAL_EPSILON_SQUARED ||
    Cartesian3.magnitudeSquared(tangentY) <= GUIDE_NORMAL_EPSILON_SQUARED
  ) {
    if (previousSurfaceNormalECEF) {
      return Cartesian3.clone(previousSurfaceNormalECEF, new Cartesian3());
    }

    return getLocalUpDirectionAtPosition(centerPosition);
  }

  const sampledNormal = Cartesian3.cross(tangentX, tangentY, new Cartesian3());
  if (
    Cartesian3.magnitudeSquared(sampledNormal) <= GUIDE_NORMAL_EPSILON_SQUARED
  ) {
    if (previousSurfaceNormalECEF) {
      return Cartesian3.clone(previousSurfaceNormalECEF, new Cartesian3());
    }

    return getLocalUpDirectionAtPosition(centerPosition);
  }

  const normalizedNormal = Cartesian3.normalize(
    sampledNormal,
    new Cartesian3()
  );
  const localUp = getLocalUpDirectionAtPosition(centerPosition);
  if (Cartesian3.dot(normalizedNormal, localUp) < 0) {
    return Cartesian3.negate(normalizedNormal, new Cartesian3());
  }

  return normalizedNormal;
};

export const resolvePreferredPointQueryPick = (
  scene: Scene,
  screenPosition: Cartesian2,
  { resolveGlobePosition = true }: ResolvePointQueryPickOptions = {}
): ResolvedPointQueryPick => {
  const frameCache = readOrCreatePointQueryFrameCache(scene);
  const screenKey = toScreenKey(screenPosition);
  const scenePositionECEF = pickPrimaryTilesetPositionAtScreenPosition(
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

  return {
    pickedPositionECEF: scenePositionECEF,
    scenePositionECEF,
    globePositionECEF,
  };
};

export const samplePreferredPointQuerySurfaceNormal = (
  scene: Scene,
  screenPosition: Cartesian2,
  centerPosition: Cartesian3,
  {
    previousSurfaceNormalECEF = null,
  }: SamplePointQuerySurfaceNormalOptions = {}
) => {
  const rightPosition = pickPrimaryTilesetPositionAtScreenPosition(
    scene,
    offsetScreenPosition(
      screenPosition,
      POINTER_NORMAL_SAMPLE_OFFSET_PX,
      0,
      OFFSET_SCREEN_POSITION_SCRATCH
    )
  );
  const leftPosition = pickPrimaryTilesetPositionAtScreenPosition(
    scene,
    offsetScreenPosition(
      screenPosition,
      -POINTER_NORMAL_SAMPLE_OFFSET_PX,
      0,
      OFFSET_SCREEN_POSITION_SCRATCH
    )
  );
  const upPosition = pickPrimaryTilesetPositionAtScreenPosition(
    scene,
    offsetScreenPosition(
      screenPosition,
      0,
      -POINTER_NORMAL_SAMPLE_OFFSET_PX,
      OFFSET_SCREEN_POSITION_SCRATCH
    )
  );
  const downPosition = pickPrimaryTilesetPositionAtScreenPosition(
    scene,
    offsetScreenPosition(
      screenPosition,
      0,
      POINTER_NORMAL_SAMPLE_OFFSET_PX,
      OFFSET_SCREEN_POSITION_SCRATCH
    )
  );

  const tangentX = resolveScreenSpaceTangent(
    centerPosition,
    rightPosition,
    leftPosition
  );
  const tangentY = resolveScreenSpaceTangent(
    centerPosition,
    downPosition,
    upPosition
  );

  return resolveStableSurfaceNormal(
    centerPosition,
    tangentX,
    tangentY,
    previousSurfaceNormalECEF
  );
};
