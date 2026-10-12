import { Vector3 } from "three";
import { shouldRestepScreenScale, snapToNiceStep } from "@carma-commons/math";

import type { AnnotationEngine } from "../engine";

const MIN_STEPPED_RADIUS_METERS = 0.1;

/**
 * A world disc radius picked so the disc comes out near a screen target, kept
 * until the view changes. The restep test reads the scale at the point the
 * current size was picked at, not at the pointer: a pointer wandering between
 * a near roof and the far ground does not change that scale, a zoom or a
 * camera move does. Quantised steps land on a 1, 2, 5, 10, 20 m diameter series.
 */
export const createSteppedDiscRadius = ({
  engine,
  stepFactor,
  targetScreenRadiusCssPx,
  quantize,
  fallbackRadiusMeters,
}: {
  engine: AnnotationEngine;
  stepFactor: number;
  targetScreenRadiusCssPx: number;
  quantize: boolean;
  fallbackRadiusMeters: number;
}) => {
  let radiusMeters: number | null = null;
  let referenceScale = 0;
  const referencePoint = new Vector3();

  return (center: Vector3): number => {
    if (
      radiusMeters !== null &&
      !shouldRestepScreenScale(
        referenceScale,
        engine.getScreenPixelsPerMeterAt(referencePoint),
        stepFactor
      )
    ) {
      return radiusMeters;
    }

    const scaleHere = engine.getScreenPixelsPerMeterAt(center);
    if (!Number.isFinite(scaleHere) || scaleHere <= 0) {
      return radiusMeters ?? fallbackRadiusMeters;
    }

    const continuousRadius = targetScreenRadiusCssPx / scaleHere;
    radiusMeters = Math.max(
      quantize ? snapToNiceStep(continuousRadius * 2) / 2 : continuousRadius,
      MIN_STEPPED_RADIUS_METERS
    );
    referenceScale = scaleHere;
    referencePoint.copy(center);
    return radiusMeters;
  };
};
