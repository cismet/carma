import type { Vector3 } from "three";
import { clamp } from "@carma-commons/math";
import {
  getDiscWorldRadius,
  type AnnotationEngine,
} from "@carma-mapping/annotations/core";

const MIN_DISC_RADIUS_METERS = 0.1;
const MAX_INNER_HOLE_RADIUS_RATIO = 0.999;

export const clampInnerHoleRadiusRatio = (ratio: number) =>
  clamp(ratio, 0, MAX_INNER_HOLE_RADIUS_RATIO);

export const resolvePointQueryDiscRadius = ({
  engine,
  pointECEF,
  discNormalECEF,
  radiusMeters,
  scalingMode,
  targetScreenRadiusCssPx,
}: {
  engine: AnnotationEngine;
  pointECEF: Vector3;
  discNormalECEF: Vector3;
  radiusMeters: number;
  scalingMode: "screen" | "world";
  targetScreenRadiusCssPx: number;
}) => {
  const resolvedRadiusMeters = Math.max(radiusMeters, MIN_DISC_RADIUS_METERS);

  return scalingMode === "world"
    ? resolvedRadiusMeters
    : getDiscWorldRadius(
        (positionECEF) => engine.worldToScreen(positionECEF),
        pointECEF,
        discNormalECEF,
        resolvedRadiusMeters,
        targetScreenRadiusCssPx
      );
};
