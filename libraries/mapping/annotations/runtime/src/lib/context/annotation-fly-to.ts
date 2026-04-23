import { BoundingSphere, type Cartesian3 } from "@carma-cesium";
import { flyToBoundingSphereExtent } from "@carma-mapping/engines/cesium/core";

import type { Scene } from "@carma-cesium";
import { ANNOTATIONS_HOST_DEFAULTS } from "./annotations-host-defaults";

export const flyToAnnotationPoints = ({
  scene,
  points,
}: {
  scene: Scene | null;
  points: readonly Cartesian3[];
}) => {
  if (!scene || scene.isDestroyed() || points.length === 0) {
    return;
  }

  const sphere = BoundingSphere.fromPoints([...points]);
  sphere.radius = Math.max(
    sphere.radius,
    ANNOTATIONS_HOST_DEFAULTS.infoBoxFlyTo.minRadiusMeters
  );
  flyToBoundingSphereExtent(scene.camera, sphere, {
    minRange: ANNOTATIONS_HOST_DEFAULTS.infoBoxFlyTo.minRadiusMeters,
    paddingFactor: ANNOTATIONS_HOST_DEFAULTS.infoBoxFlyTo.paddingFactor,
  });
};
