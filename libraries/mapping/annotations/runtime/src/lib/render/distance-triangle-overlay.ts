import {
  distanceVisualizationDefaults,
  ecefFromGeographicCoordinate,
  getEastNorthUpOffset,
} from "@carma-mapping/annotations/core";

import {
  RUNTIME_DISTANCE_TRIANGLE_ANCHOR_COORDINATE_ROLE,
  RUNTIME_POINT_LABEL_COORDINATE_SELECTION,
  type RuntimeDistanceTriangleAnchorCoordinateRole,
  type RuntimePointLabelCoordinateSelection,
} from "./annotation-render-models";
import type { AnnotationGeographicCoordinate } from "../store";

export const resolveOppositeDistanceTriangleAnchorCoordinateRole = (
  coordinateRole: RuntimeDistanceTriangleAnchorCoordinateRole
): RuntimeDistanceTriangleAnchorCoordinateRole =>
  coordinateRole ===
  RUNTIME_DISTANCE_TRIANGLE_ANCHOR_COORDINATE_ROLE.START_COORDINATE
    ? RUNTIME_DISTANCE_TRIANGLE_ANCHOR_COORDINATE_ROLE.END_COORDINATE
    : RUNTIME_DISTANCE_TRIANGLE_ANCHOR_COORDINATE_ROLE.START_COORDINATE;

export const resolveDistanceTriangleAnchorCoordinateRole = (
  _coordinates: readonly AnnotationGeographicCoordinate[]
): RuntimeDistanceTriangleAnchorCoordinateRole =>
  RUNTIME_DISTANCE_TRIANGLE_ANCHOR_COORDINATE_ROLE.START_COORDINATE;

export const resolveOppositePointLabelCoordinateSelection = (
  coordinateSelection: RuntimePointLabelCoordinateSelection
): RuntimePointLabelCoordinateSelection =>
  coordinateSelection ===
  RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE
    ? RUNTIME_POINT_LABEL_COORDINATE_SELECTION.RIGHTMOST_SCREEN_SPACE
    : RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE;

export const resolveDistanceTriangleAnchorCoordinateSelection = (
  coordinates: readonly AnnotationGeographicCoordinate[]
): RuntimePointLabelCoordinateSelection => {
  const startCoordinate = coordinates[0];
  const endCoordinate = coordinates[coordinates.length - 1];
  if (!startCoordinate || !endCoordinate) {
    return RUNTIME_POINT_LABEL_COORDINATE_SELECTION.RIGHTMOST_SCREEN_SPACE;
  }

  const startPoint = ecefFromGeographicCoordinate(startCoordinate);
  const endPoint = ecefFromGeographicCoordinate(endCoordinate);
  const enuOffset = getEastNorthUpOffset(startPoint, endPoint);
  const horizontalDistanceMeters = Math.hypot(enuOffset.east, enuOffset.north);

  return horizontalDistanceMeters >
    distanceVisualizationDefaults.referenceLineEpsilonMeters
    ? RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE
    : RUNTIME_POINT_LABEL_COORDINATE_SELECTION.RIGHTMOST_SCREEN_SPACE;
};
