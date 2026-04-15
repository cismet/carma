import { BoundingSphere, type Cartesian3 } from "@carma-cesium";
import { flyToBoundingSphereExtent } from "@carma-mapping/engines/cesium/core";

import type { RuntimeScene } from "../types/runtime-scene.types";
import { ANNOTATIONS_RUNTIME_HOST_DEFAULTS } from "./annotations-runtime-host-defaults";

export const flyToAnnotationPoints = ({
  scene,
  points,
}: {
  scene: RuntimeScene | null;
  points: readonly Cartesian3[];
}) => {
  if (!scene || scene.isDestroyed() || points.length === 0) {
    return;
  }

  const sphere = BoundingSphere.fromPoints([...points]);
  sphere.radius = Math.max(
    sphere.radius,
    ANNOTATIONS_RUNTIME_HOST_DEFAULTS.infoBoxFlyTo.minRadiusMeters
  );
  flyToBoundingSphereExtent(scene.camera, sphere, {
    minRange: ANNOTATIONS_RUNTIME_HOST_DEFAULTS.infoBoxFlyTo.minRadiusMeters,
    paddingFactor: ANNOTATIONS_RUNTIME_HOST_DEFAULTS.infoBoxFlyTo.paddingFactor,
  });
};
