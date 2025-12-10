import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  defined,
  Scene,
  isValidScene,
} from "@carma/cesium";
import {
  getCanvasDimensions,
  normalizedToPixelPosition,
} from "@carma-commons/dom/canvas";
import { warnOnce } from "@carma-commons/utils";

import { CssPixelPosition } from "@carma/units/types";

export type PickResult = {
  position: [number, number];
  windowPosition: CssPixelPosition;
  windowPositionCartesian2: Cartesian2;
  scenePosition: Cartesian3 | null;
  coordinates: Cartographic | null;
};

/**
 * Core picking function - picks scene positions at given canvas coordinates
 *
 * Pure read operation - does not modify scene settings.
 * Assumes scene.pickTranslucentDepth is false (set at initialization).
 */

export const pickScenePositions = (
  scene: Scene,
  positions: [number, number][],
  label: string
): PickResult[] | null => {
  if (!isValidScene(scene)) {
    console.warn(`[CESIUM|PICKER|${label}] Invalid scene`);
    return null;
  }
  // todo caching here for same frame/timestamp per position??

  // Warn if pickTranslucentDepth is enabled (should be disabled at scene initialization)
  if (scene.pickTranslucentDepth) {
    warnOnce(
      `[CESIUM|PICKER|${label}] pickTranslucentDepth is enabled - this can cause framebuffer issues. Should be disabled at scene init.`
    );
  }

  // Warn if depthTestAgainstTerrain is not enabled (should be enabled at scene initialization)
  if (scene.globe.depthTestAgainstTerrain !== true) {
    warnOnce(
      `[CESIUM|PICKER|${label}] depthTestAgainstTerrain is not enabled - this can cause framebuffer issues. Should be enabled at scene init.`
    );
  }

  const { canvas } = scene;
  const canvasDimensions = getCanvasDimensions(canvas);

  const results: PickResult[] = positions.map((position) => {
    const [windowPosition, windowPositionCartesian2] =
      normalizedToPixelPosition(canvasDimensions, position);

    const scenePosition = scene.pickPosition(
      windowPositionCartesian2
    ) as Cartesian3 | null;

    const coordinates =
      scenePosition && defined(scenePosition)
        ? Cartographic.fromCartesian(scenePosition)
        : null;

    return {
      position,
      canvasDimensions,
      windowPosition,
      windowPositionCartesian2,
      scenePosition,
      coordinates,
    };
  });

  return results;
};

const CENTER_PICK_POSITION: [number, number] = [0.5, 0.5];

/**
 * Get the precise center position of the scene (where the camera is looking at).
 * Tries to pick from the depth buffer first (supporting 3D tiles, terrain).
 *
 * @param scene The Cesium scene.
 * @returns The center position or undefined if not picking anything (e.g. sky).
 */
export const pickSceneCenter = (scene: Scene): Cartesian3 | undefined => {
  if (!scene.globe) {
    return undefined;
  }

  // Try to pick precise surface position first (works with 3D tiles, etc.)
  const pickResults = pickScenePositions(
    scene,
    [CENTER_PICK_POSITION],
    "pickSceneCenter"
  );
  return pickResults?.[0]?.scenePosition ?? undefined;
};
