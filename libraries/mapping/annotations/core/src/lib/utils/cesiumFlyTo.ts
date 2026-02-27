import type { Cartesian3, Scene } from "@carma/cesium";
import { BoundingSphere } from "@carma/cesium";
import { flyToBoundingSphereExtent } from "@carma-mapping/engines/cesium/api";

const DEFAULT_MIN_RADIUS = 50;
const DEFAULT_PADDING_FACTOR = 1.1;

/**
 * Fly the Cesium camera to frame a group of points.
 *
 * @param scene - The Cesium Scene object.
 * @param points - An array of Cartesian3 points to frame.
 * @param minRadius - Minimum radius for framing (default: 50).
 * @param paddingFactor - Padding factor to apply to the calculated range (default: 1.1).
 */

export const flyToPointGroup = (
  scene: Scene | null | undefined,
  points: Cartesian3[],
  minRadius: number = DEFAULT_MIN_RADIUS,
  paddingFactor: number = DEFAULT_PADDING_FACTOR
) => {
  if (!scene || scene.isDestroyed() || points.length === 0) return;
  const sphere = BoundingSphere.fromPoints(points);
  sphere.radius = Math.max(sphere.radius, Math.max(minRadius, 0));

  flyToBoundingSphereExtent(scene.camera, sphere, {
    minRange: minRadius,
    paddingFactor,
  });
};
