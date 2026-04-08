import {
  getCanvasDimensions,
  normalizedToPixelPosition,
} from "@carma-commons/dom/canvas";
import { warnOnce } from "@carma-commons/utils";
import type { CssPixelPosition } from "@carma-units";

import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  defined,
  type Scene,
} from "@carma-cesium";
import { isValidScene } from "../../carma-guards";

export type PickResult = {
  position: [number, number];
  windowPosition: CssPixelPosition;
  windowPositionCartesian2: Cartesian2;
  scenePosition: Cartesian3 | null;
  coordinates: Cartographic | null;
};

export const pickScenePositions = (
  scene: Scene,
  positions: [number, number][],
  label: string
): PickResult[] | null => {
  if (!isValidScene(scene)) {
    console.warn(`[CESIUM|PICKER|${label}] Invalid scene`);
    return null;
  }

  if (scene.pickTranslucentDepth) {
    warnOnce(
      `[CESIUM|PICKER|${label}] pickTranslucentDepth is enabled - this can cause framebuffer issues. Should be disabled at scene init.`
    );
  }

  if (scene.globe.depthTestAgainstTerrain !== true) {
    warnOnce(
      `[CESIUM|PICKER|${label}] depthTestAgainstTerrain is not enabled - this can cause framebuffer issues. Should be enabled at scene init.`
    );
  }

  const canvasDimensions = getCanvasDimensions(scene.canvas);

  return positions.map((position) => {
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
      windowPosition,
      windowPositionCartesian2,
      scenePosition,
      coordinates,
    };
  });
};

const CENTER_PICK_POSITION: [number, number] = [0.5, 0.5];

export const pickSceneCenter = (scene: Scene): Cartesian3 | undefined =>
  pickScenePositions(scene, [CENTER_PICK_POSITION], "pickSceneCenter")?.[0]
    ?.scenePosition ?? undefined;

export const pickScenePositionAtScreenPosition = (
  scene: Scene,
  screenPosition: Cartesian2
): Cartesian3 | null => scene.pickPosition(screenPosition) ?? null;

export const pickGlobePositionAtScreenPosition = (
  scene: Scene,
  screenPosition: Cartesian2
): Cartesian3 | null => {
  const pickRay = scene.camera.getPickRay(screenPosition);
  if (!pickRay) return null;
  return scene.globe.pick(pickRay, scene) ?? null;
};
