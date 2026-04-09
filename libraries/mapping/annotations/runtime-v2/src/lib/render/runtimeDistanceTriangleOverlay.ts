import { REFERENCE_LINE_EPSILON_METERS } from "@carma-mapping/annotations/core";
import {
  CarmaTransforms,
  cartesian3FromGeographicCoordinate,
} from "@carma-mapping/engines/cesium/core";

import {
  RUNTIME_POINT_LABEL_COORDINATE_SELECTION,
  type RuntimePointLabelCoordinateSelection,
} from "./measurementRenderModels";
import type { RuntimeCoordinate } from "../store";

export const resolveOppositePointLabelCoordinateSelection = (
  coordinateSelection: RuntimePointLabelCoordinateSelection
): RuntimePointLabelCoordinateSelection =>
  coordinateSelection ===
  RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE
    ? RUNTIME_POINT_LABEL_COORDINATE_SELECTION.RIGHTMOST_SCREEN_SPACE
    : RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE;

export const resolveDistanceTriangleAnchorCoordinateSelection = (
  coordinates: readonly RuntimeCoordinate[]
): RuntimePointLabelCoordinateSelection => {
  const startCoordinate = coordinates[0];
  const endCoordinate = coordinates[coordinates.length - 1];
  if (!startCoordinate || !endCoordinate) {
    return RUNTIME_POINT_LABEL_COORDINATE_SELECTION.RIGHTMOST_SCREEN_SPACE;
  }

  const startPoint = cartesian3FromGeographicCoordinate(startCoordinate);
  const endPoint = cartesian3FromGeographicCoordinate(endCoordinate);
  const enuOffset = CarmaTransforms.getEastNorthUpOffset(startPoint, endPoint);
  const horizontalDistanceMeters = Math.hypot(enuOffset.east, enuOffset.north);

  return horizontalDistanceMeters > REFERENCE_LINE_EPSILON_METERS
    ? RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE
    : RUNTIME_POINT_LABEL_COORDINATE_SELECTION.RIGHTMOST_SCREEN_SPACE;
};
