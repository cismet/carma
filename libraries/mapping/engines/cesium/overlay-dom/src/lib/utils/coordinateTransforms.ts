import type { Scene, Cartesian3 } from "@carma/cesium";
import { SceneTransforms } from "@carma/cesium";

import type { ScreenPosition } from "../types";

/**
 * Convert Cartesian3 world position to screen coordinates
 *
 * Salvaged from cesium-reference playground measurement utilities.
 * Handles visibility checks and behind-camera detection.
 *
 * @param scene - Cesium scene
 * @param cartesian3 - World position
 * @returns Screen position with visibility info, or null if conversion fails
 */
export function cartesianToScreen(
  scene: Scene,
  cartesian3: Cartesian3
): ScreenPosition | null {
  try {
    const cartesian2 = SceneTransforms.worldToWindowCoordinates(
      scene,
      cartesian3
    );

    if (!cartesian2) {
      return {
        x: 0,
        y: 0,
        visible: false,
        behindCamera: true,
      };
    }

    const canvas = scene.canvas;
    const isVisible =
      cartesian2.x >= 0 &&
      cartesian2.x <= canvas.clientWidth &&
      cartesian2.y >= 0 &&
      cartesian2.y <= canvas.clientHeight;

    return {
      x: cartesian2.x,
      y: cartesian2.y,
      visible: isVisible,
      behindCamera: false,
    };
  } catch {
    return null;
  }
}

/**
 * Convert screen coordinates to Cartesian3 world position
 *
 * TODO: Implement if needed for interaction handling
 *
 * @param _scene - Cesium scene
 * @param _screenX - Screen X coordinate
 * @param _screenY - Screen Y coordinate
 * @returns World position or null
 */
export function screenToCartesian(
  _scene: Scene,
  _screenX: number,
  _screenY: number
): Cartesian3 | null {
  // TODO: Implement using scene.pickPosition or scene.globe.pick
  return null;
}
