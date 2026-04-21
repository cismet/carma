import { fromCesiumPitchRadToCarmaViewPitchDeg } from "@carma-commons/camera/model";
import { clamp } from "@carma-commons/math";
import { Cartesian2, Cartesian3, type Scene } from "@carma-cesium";
import { radToDegNumeric, type Radians } from "@carma-units";

import {
  applyRollToHeadingForCameraNearNadir,
  captureCurrentCameraState,
} from "../camera";
const MAX_COMPASS_PITCH_DEG = 90;
const VIEWPORT_CENTER = new Cartesian2();

export type CesiumCompassOrientationDeg = {
  headingDeg: number;
  pitchDeg: number;
};

export type CesiumViewportCenterZoomAnchor = {
  point: Cartesian3 | null;
  usedGlobeFallback: boolean;
};

type SceneFrameStateLike = {
  frameState?: { frameNumber?: number };
};

type MinimalCesiumScene = SceneFrameStateLike &
  Pick<Scene, "camera" | "pickPosition" | "canvas" | "globe">;

type CesiumPerFrameCache = {
  frameNumber: number | null;
  lastResolvedSceneCenter: Cartesian3 | null;
  sceneCenterResolvedForFrame: boolean;
  sceneCenterForFrame: Cartesian3 | null;
  lastResolvedZoomAnchor: CesiumViewportCenterZoomAnchor;
  zoomAnchorResolvedForFrame: boolean;
  zoomAnchorForFrame: CesiumViewportCenterZoomAnchor;
  compassOrientationForFrame: CesiumCompassOrientationDeg | null;
};

const cesiumPerFrameCache = new WeakMap<
  MinimalCesiumScene,
  CesiumPerFrameCache
>();

const readSceneFrameNumber = (scene: SceneFrameStateLike): number | null => {
  const frameNumber = scene.frameState?.frameNumber;
  return typeof frameNumber === "number" && Number.isFinite(frameNumber)
    ? frameNumber
    : null;
};

const readOrCreateFrameCache = (
  scene: MinimalCesiumScene
): CesiumPerFrameCache => {
  const frameNumber = readSceneFrameNumber(scene);
  const existingCache = cesiumPerFrameCache.get(scene);

  if (!existingCache) {
    const initialCache: CesiumPerFrameCache = {
      frameNumber,
      lastResolvedSceneCenter: null,
      sceneCenterResolvedForFrame: false,
      sceneCenterForFrame: null,
      lastResolvedZoomAnchor: {
        point: null,
        usedGlobeFallback: false,
      },
      zoomAnchorResolvedForFrame: false,
      zoomAnchorForFrame: {
        point: null,
        usedGlobeFallback: false,
      },
      compassOrientationForFrame: null,
    };
    cesiumPerFrameCache.set(scene, initialCache);
    return initialCache;
  }

  if (frameNumber === null) {
    existingCache.frameNumber = null;
    existingCache.sceneCenterResolvedForFrame = false;
    existingCache.sceneCenterForFrame = null;
    existingCache.zoomAnchorResolvedForFrame = false;
    existingCache.zoomAnchorForFrame = {
      point: null,
      usedGlobeFallback: false,
    };
    existingCache.compassOrientationForFrame = null;
    return existingCache;
  }

  if (existingCache.frameNumber !== frameNumber) {
    existingCache.frameNumber = frameNumber;
    existingCache.sceneCenterResolvedForFrame = false;
    existingCache.sceneCenterForFrame = null;
    existingCache.zoomAnchorResolvedForFrame = false;
    existingCache.zoomAnchorForFrame = {
      point: null,
      usedGlobeFallback: false,
    };
    existingCache.compassOrientationForFrame = null;
  }

  return existingCache;
};

const pickViewportCenter = (scene: MinimalCesiumScene): Cartesian3 | null => {
  const width = scene.canvas?.clientWidth;
  const height = scene.canvas?.clientHeight;
  if (
    typeof width !== "number" ||
    !Number.isFinite(width) ||
    width <= 0 ||
    typeof height !== "number" ||
    !Number.isFinite(height) ||
    height <= 0
  ) {
    return null;
  }

  VIEWPORT_CENTER.x = width * 0.5;
  VIEWPORT_CENTER.y = height * 0.5;

  try {
    return (scene.pickPosition(VIEWPORT_CENTER) as Cartesian3 | null) ?? null;
  } catch {
    return null;
  }
};

const readViewportCenter = (scene: MinimalCesiumScene): Cartesian2 | null => {
  const width = scene.canvas?.clientWidth;
  const height = scene.canvas?.clientHeight;
  if (
    typeof width !== "number" ||
    !Number.isFinite(width) ||
    width <= 0 ||
    typeof height !== "number" ||
    !Number.isFinite(height) ||
    height <= 0
  ) {
    return null;
  }

  VIEWPORT_CENTER.x = width * 0.5;
  VIEWPORT_CENTER.y = height * 0.5;
  return VIEWPORT_CENTER;
};

const pickViewportCenterZoomAnchor = (
  scene: MinimalCesiumScene
): CesiumViewportCenterZoomAnchor => {
  const sceneCenter = readCachedCesiumSceneCenter(scene);
  if (sceneCenter) {
    return {
      point: sceneCenter,
      usedGlobeFallback: false,
    };
  }

  const viewportCenter = readViewportCenter(scene);
  if (!viewportCenter || !scene.globe) {
    return {
      point: null,
      usedGlobeFallback: false,
    };
  }

  try {
    const pickRay = scene.camera.getPickRay(viewportCenter);
    const globePoint =
      pickRay && scene.globe
        ? (scene.globe.pick(pickRay, scene as Scene) as Cartesian3 | null) ??
          null
        : null;

    return {
      point: globePoint,
      usedGlobeFallback: globePoint !== null,
    };
  } catch {
    return {
      point: null,
      usedGlobeFallback: false,
    };
  }
};

const toCompassPitchDeg = (pitchRad: Radians): number =>
  clamp(
    fromCesiumPitchRadToCarmaViewPitchDeg(pitchRad) ?? 0,
    0,
    MAX_COMPASS_PITCH_DEG
  );

export const readCachedCesiumSceneCenter = (
  scene: MinimalCesiumScene
): Cartesian3 | null => {
  const frameCache = readOrCreateFrameCache(scene);

  if (frameCache.sceneCenterResolvedForFrame) {
    return frameCache.sceneCenterForFrame ?? frameCache.lastResolvedSceneCenter;
  }

  const sceneCenter = pickViewportCenter(scene);
  frameCache.sceneCenterResolvedForFrame = true;
  frameCache.sceneCenterForFrame = sceneCenter;
  if (sceneCenter) {
    frameCache.lastResolvedSceneCenter = sceneCenter;
  }

  return sceneCenter ?? frameCache.lastResolvedSceneCenter;
};

export const readCachedCesiumCompassOrientationDeg = (
  scene: MinimalCesiumScene
): CesiumCompassOrientationDeg => {
  const frameCache = readOrCreateFrameCache(scene);

  if (frameCache.compassOrientationForFrame) {
    return frameCache.compassOrientationForFrame;
  }

  captureCurrentCameraState(scene.camera, {
    includeFov: false,
    includeCartographic: false,
    includeMatrices: false,
  });

  const orientation = {
    headingDeg: radToDegNumeric(
      applyRollToHeadingForCameraNearNadir(scene.camera)
    ),
    pitchDeg: toCompassPitchDeg(scene.camera.pitch as Radians),
  };

  frameCache.compassOrientationForFrame = orientation;
  return orientation;
};

export const readCachedCesiumViewportCenterZoomAnchor = (
  scene: MinimalCesiumScene
): CesiumViewportCenterZoomAnchor => {
  const frameCache = readOrCreateFrameCache(scene);

  if (frameCache.zoomAnchorResolvedForFrame) {
    return frameCache.zoomAnchorForFrame.point
      ? frameCache.zoomAnchorForFrame
      : frameCache.lastResolvedZoomAnchor;
  }

  const zoomAnchor = pickViewportCenterZoomAnchor(scene);
  frameCache.zoomAnchorResolvedForFrame = true;
  frameCache.zoomAnchorForFrame = zoomAnchor;
  if (zoomAnchor.point) {
    frameCache.lastResolvedZoomAnchor = zoomAnchor;
  }

  return zoomAnchor.point ? zoomAnchor : frameCache.lastResolvedZoomAnchor;
};
