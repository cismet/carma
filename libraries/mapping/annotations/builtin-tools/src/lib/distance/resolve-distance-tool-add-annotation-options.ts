import { ecefFromGeographicCoordinate } from "@carma-mapping/annotations/core";

import {
  isValidAnnotationEngine,
  RUNTIME_POINT_LABEL_COORDINATE_SELECTION,
} from "@carma-mapping/annotations/runtime";
import type { AnnotationToolAddAnnotationContext } from "@carma-mapping/annotations/runtime";

export const resolveDistanceToolAddAnnotationOptions = ({
  engine,
  coordinates,
  options,
}: AnnotationToolAddAnnotationContext) => {
  if (
    options?.distanceAnchorCoordinateSelection !== undefined ||
    !isValidAnnotationEngine(engine)
  ) {
    return options;
  }

  const startCoordinate = coordinates[0];
  const endCoordinate = coordinates[coordinates.length - 1];
  if (!startCoordinate || !endCoordinate) {
    return options;
  }

  const startScreenPosition = engine.worldToScreen(
    ecefFromGeographicCoordinate(startCoordinate)
  );
  const endScreenPosition = engine.worldToScreen(
    ecefFromGeographicCoordinate(endCoordinate)
  );

  if (!startScreenPosition || !endScreenPosition) {
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
