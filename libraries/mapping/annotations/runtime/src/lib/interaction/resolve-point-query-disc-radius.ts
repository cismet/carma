import type { Vector3 } from "three";
import { getDiscWorldRadius } from "@carma-mapping/annotations/core";

import type { AnnotationEngine } from "../engine";

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
  const resolvedRadiusMeters = Math.max(radiusMeters, 0.1);

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
