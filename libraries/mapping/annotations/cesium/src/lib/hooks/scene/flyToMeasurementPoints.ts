import { BoundingSphere, type Cartesian3, type Scene } from "@carma/cesium";

import { flyToBoundingSphereExtent } from "@carma-mapping/engines/cesium/api";

const FLY_TO_MIN_RADIUS_METERS = 50;
const FLY_TO_PADDING_FACTOR = 1.1;

export const flyToMeasurementPoints = (
  scene: Scene | null | undefined,
  points: readonly Cartesian3[]
) => {
  if (!scene || scene.isDestroyed() || points.length === 0) {
    return;
  }

  const sphere = BoundingSphere.fromPoints([...points]);
  sphere.radius = Math.max(sphere.radius, FLY_TO_MIN_RADIUS_METERS);

  flyToBoundingSphereExtent(scene.camera, sphere, {
    minRange: FLY_TO_MIN_RADIUS_METERS,
    paddingFactor: FLY_TO_PADDING_FACTOR,
  });
};
