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
  type Scene,
} from "@carma-cesium";
import { isValidCartesian3, isValidScene } from "../../carma-guards";

export type PickResult = {
  position: [number, number];
  windowPosition: CssPixelPosition;
  windowPositionCartesian2: Cartesian2;
  scenePosition: Cartesian3 | null;
  coordinates: Cartographic | null;
};

const tryPickScenePosition = (
  scene: Scene,
  screenPosition: Cartesian2,
  label: string
): Cartesian3 | null => {
  try {
    const scenePosition = scene.pickPosition(screenPosition);
    return isValidCartesian3(scenePosition) ? scenePosition : null;
  } catch {
    warnOnce(
      `[CESIUM|PICKER|${label}] scene.pickPosition(...) failed while resolving a scene pick.`
    );
    return null;
  }
};

const tryCartographicFromCartesian = (
  scenePosition: Cartesian3,
  label: string
): Cartographic | null => {
  try {
    return Cartographic.fromCartesian(scenePosition);
  } catch {
    warnOnce(
      `[CESIUM|PICKER|${label}] Cartographic.fromCartesian(...) failed for a picked scene position.`
    );
    return null;
  }
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
    const pickedScenePosition = tryPickScenePosition(
      scene,
      windowPositionCartesian2,
      label
    );
    const coordinates = pickedScenePosition
      ? tryCartographicFromCartesian(pickedScenePosition, label)
      : null;
    const scenePosition = coordinates ? pickedScenePosition : null;

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
): Cartesian3 | null =>
  tryPickScenePosition(
    scene,
    screenPosition,
    "pickScenePositionAtScreenPosition"
  );

export const pickGlobePositionAtScreenPosition = (
  scene: Scene,
  screenPosition: Cartesian2
): Cartesian3 | null => {
  const pickRay = scene.camera.getPickRay(screenPosition);
  if (!pickRay) return null;
  const globePosition = scene.globe.pick(pickRay, scene);
  return isValidCartesian3(globePosition) ? globePosition : null;
};
