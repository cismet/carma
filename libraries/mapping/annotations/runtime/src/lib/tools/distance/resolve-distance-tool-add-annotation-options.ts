import { SceneTransforms, defined } from "@carma-cesium";
import { cartesian3FromGeographicCoordinate } from "@carma-mapping/engines/cesium/core";

import { RUNTIME_POINT_LABEL_COORDINATE_SELECTION } from "../../render/measurement-render-models";
import type { AnnotationToolAddAnnotationContext } from "../annotation-tool-plugin.types";

export const resolveDistanceToolAddAnnotationOptions = ({
  scene,
  coordinates,
  options,
}: AnnotationToolAddAnnotationContext) => {
  if (
    options?.distanceAnchorCoordinateSelection !== undefined ||
    !scene ||
    scene.isDestroyed()
  ) {
    return options;
  }

  const startCoordinate = coordinates[0];
  const endCoordinate = coordinates[coordinates.length - 1];
  if (!startCoordinate || !endCoordinate) {
    return options;
  }

  const startScreenPosition = SceneTransforms.worldToWindowCoordinates(
    scene,
    cartesian3FromGeographicCoordinate(startCoordinate)
  );
  const endScreenPosition = SceneTransforms.worldToWindowCoordinates(
    scene,
    cartesian3FromGeographicCoordinate(endCoordinate)
  );

  if (!defined(startScreenPosition) || !defined(endScreenPosition)) {
    return options;
  }

  return {
    ...options,
    distanceAnchorCoordinateSelection:
      startScreenPosition.x <= endScreenPosition.x
        ? RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE
        : RUNTIME_POINT_LABEL_COORDINATE_SELECTION.RIGHTMOST_SCREEN_SPACE,
  };
};
