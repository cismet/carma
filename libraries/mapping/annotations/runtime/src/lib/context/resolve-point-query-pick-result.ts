import {
  ecefFromGeographicCoordinate,
  getLocalUpDirectionAtAnchor,
} from "@carma-geo/proj";

import { isValidAnnotationEngine, type AnnotationEngine } from "../engine";
import type { AnnotationPointQueryInputModifier } from "../interaction/lifecycle";
import type { PointQueryPickResult } from "../registry";
import type { AnnotationGeographicCoordinate, AnnotationNode } from "../store";
import { areCoordinatesEqual } from "../utils/coordinate-equality";

/**
 * A hover sample moved onto the snap point it resolves to: the hovered node,
 * else the coordinate snapping gives. `isLockedToSnapPoint` tells the
 * indicator to stay on that point instead of following the pointer.
 */
export const resolveSnappedPointQueryPickResult = ({
  engine,
  hoveredNode,
  coordinate,
  screenPosition,
  pointECEF,
  surfaceNormalECEF,
  inputModifier,
  resolvePointQueryCoordinate,
}: {
  engine: AnnotationEngine | null;
  hoveredNode: AnnotationNode | null;
  coordinate: AnnotationGeographicCoordinate;
  screenPosition: { x: number; y: number };
  pointECEF: PointQueryPickResult["pointECEF"];
  surfaceNormalECEF: PointQueryPickResult["surfaceNormalECEF"];
  inputModifier?: AnnotationPointQueryInputModifier;
  resolvePointQueryCoordinate: (
    coordinate: AnnotationGeographicCoordinate,
    screenPosition: { x: number; y: number }
  ) => AnnotationGeographicCoordinate;
}): { pickResult: PointQueryPickResult; isLockedToSnapPoint: boolean } => {
  const snappedCoordinate =
    hoveredNode?.coordinate ??
    resolvePointQueryCoordinate(coordinate, screenPosition);
  const isLockedToSnapPoint =
    hoveredNode !== null || !areCoordinatesEqual(snappedCoordinate, coordinate);
  const snappedPointECEF = isLockedToSnapPoint
    ? ecefFromGeographicCoordinate(snappedCoordinate)
    : pointECEF;
  const snappedScreenPosition =
    isLockedToSnapPoint && isValidAnnotationEngine(engine) && snappedPointECEF
      ? engine.worldToScreen(snappedPointECEF)
      : null;

  return {
    isLockedToSnapPoint,
    pickResult: {
      coordinate: snappedCoordinate,
      screenPosition: snappedScreenPosition
        ? { x: snappedScreenPosition.x, y: snappedScreenPosition.y }
        : screenPosition,
      pointECEF: snappedPointECEF ?? pointECEF,
      surfaceNormalECEF:
        isLockedToSnapPoint && snappedPointECEF
          ? getLocalUpDirectionAtAnchor(snappedPointECEF)
          : surfaceNormalECEF,
      ...(inputModifier ? { inputModifier } : {}),
    },
  };
};
