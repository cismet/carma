import {
  getCanvasDimensions,
  normalizedToPixelPosition,
} from "@carma-commons/dom/canvas";
import { warnOnce } from "@carma-commons/utils";
import type { CssPixelPosition } from "@carma-units";

import { isValidScene } from "../../carma-guards";
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  defined,
  type Scene,
} from "@carma-cesium";
import {
  GUIDE_NORMAL_EPSILON_SQUARED,
  getLocalUpDirectionAtPosition,
} from "../primitives/GuidePrimitives";

const POINTER_NORMAL_SAMPLE_OFFSET_PX = 2;

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

export const pickBestAvailablePositionAtScreenPosition = (
  scene: Scene,
  screenPosition: Cartesian2
): Cartesian3 | null => {
  if (
    scene.pickPositionSupported !== false &&
    typeof scene.pickPosition === "function"
  ) {
    const picked = scene.pickPosition(screenPosition);
    if (picked) {
      return picked;
    }
  }

  if (
    typeof scene.camera?.getPickRay === "function" &&
    typeof scene.globe?.pick === "function"
  ) {
    const pickRay = scene.camera.getPickRay(screenPosition);
    if (pickRay) {
      return scene.globe.pick(pickRay, scene) ?? null;
    }
  }

  return null;
};

export const pickBestAvailablePositionAtViewportCenter = (
  scene: Scene
): Cartesian3 | null => {
  const viewportWidth = scene.canvas?.clientWidth;
  const viewportHeight = scene.canvas?.clientHeight;
  if (
    typeof viewportWidth !== "number" ||
    !Number.isFinite(viewportWidth) ||
    viewportWidth <= 0 ||
    typeof viewportHeight !== "number" ||
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0
  ) {
    return null;
  }

  const centerX = viewportWidth * 0.5;
  const centerY = viewportHeight * 0.5;

  return pickBestAvailablePositionAtScreenPosition(
    scene,
    new Cartesian2(centerX, centerY)
  );
};

export const sampleSurfaceNormalAtScreenPosition = (
  scene: Scene,
  screenPosition: Cartesian2,
  centerPosition: Cartesian3
): Cartesian3 => {
  const rightPosition = pickScenePositionAtScreenPosition(
    scene,
    new Cartesian2(
      screenPosition.x + POINTER_NORMAL_SAMPLE_OFFSET_PX,
      screenPosition.y
    )
  );
  const leftPosition = pickScenePositionAtScreenPosition(
    scene,
    new Cartesian2(
      screenPosition.x - POINTER_NORMAL_SAMPLE_OFFSET_PX,
      screenPosition.y
    )
  );
  const upPosition = pickScenePositionAtScreenPosition(
    scene,
    new Cartesian2(
      screenPosition.x,
      screenPosition.y - POINTER_NORMAL_SAMPLE_OFFSET_PX
    )
  );
  const downPosition = pickScenePositionAtScreenPosition(
    scene,
    new Cartesian2(
      screenPosition.x,
      screenPosition.y + POINTER_NORMAL_SAMPLE_OFFSET_PX
    )
  );

  if (!rightPosition || !leftPosition || !upPosition || !downPosition) {
    return getLocalUpDirectionAtPosition(centerPosition);
  }

  const tangentX = Cartesian3.subtract(
    rightPosition,
    leftPosition,
    new Cartesian3()
  );
  const tangentY = Cartesian3.subtract(
    downPosition,
    upPosition,
    new Cartesian3()
  );
  if (
    Cartesian3.magnitudeSquared(tangentX) <= GUIDE_NORMAL_EPSILON_SQUARED ||
    Cartesian3.magnitudeSquared(tangentY) <= GUIDE_NORMAL_EPSILON_SQUARED
  ) {
    return getLocalUpDirectionAtPosition(centerPosition);
  }

  const sampledNormal = Cartesian3.cross(tangentX, tangentY, new Cartesian3());
  if (
    Cartesian3.magnitudeSquared(sampledNormal) <= GUIDE_NORMAL_EPSILON_SQUARED
  ) {
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
