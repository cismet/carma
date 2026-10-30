import type { Vector3 } from "three";
import {
  getDiscWorldRadius,
  type AnnotationEngine,
} from "@carma-mapping/annotations/core";

import type {
  PointQueryDiscOriginJump,
  PointQueryDiscScaleChange,
} from "./point-query-controller.types";
import { pointQueryDebugDefaults } from "./point-query-debug-defaults";
import { cloneScreenVector } from "./point-query-debug-history";

type DiscChangeContext = Pick<
  PointQueryDiscOriginJump,
  "inputVersion" | "requestedAtMs" | "placementMode" | "source"
>;

/** The disc origin jumped further than a hundred screen pixels' worth of metres. */
export const detectDiscOriginJump = ({
  engine,
  inputVersion,
  requestedAtMs,
  placementMode,
  source,
  previousDiscWorldPosition,
  nextDiscWorldPosition,
  nextDiscNormal,
  previousClientPosition,
  nextClientPosition,
}: DiscChangeContext & {
  engine: AnnotationEngine;
  previousDiscWorldPosition: Vector3;
  nextDiscWorldPosition: Vector3;
  nextDiscNormal: Vector3;
  previousClientPosition: PointQueryDiscOriginJump["previousClientPosition"];
  nextClientPosition: PointQueryDiscOriginJump["nextClientPosition"];
}): PointQueryDiscOriginJump | null => {
  const metersPerPixel = getDiscWorldRadius(
    (positionECEF) => engine.worldToScreen(positionECEF),
    previousDiscWorldPosition,
    nextDiscNormal,
    1,
    1
  );
  if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) {
    return null;
  }

  const distanceMeters = previousDiscWorldPosition.distanceTo(
    nextDiscWorldPosition
  );
  const { pixelResolutionMultiplier } = pointQueryDebugDefaults.discOriginJump;
  const thresholdMeters = metersPerPixel * pixelResolutionMultiplier;
  if (distanceMeters <= thresholdMeters) {
    return null;
  }

  return {
    t: performance.now(),
    inputVersion,
    requestedAtMs,
    placementMode,
    distanceMeters,
    thresholdMeters,
    metersPerPixel,
    thresholdPixelResolutionMultiplier: pixelResolutionMultiplier,
    source,
    previousClientPosition: cloneScreenVector(previousClientPosition),
    nextClientPosition: nextClientPosition
      ? { ...nextClientPosition }
      : { x: 0, y: 0 },
  };
};

/** The disc scale changed by more than the relative threshold. */
export const detectDiscScaleChange = ({
  inputVersion,
  requestedAtMs,
  placementMode,
  source,
  previousScaleFactor,
  nextScaleFactor,
}: DiscChangeContext & {
  previousScaleFactor: number;
  nextScaleFactor: number;
}): PointQueryDiscScaleChange | null => {
  const relativeChange =
    Math.abs(nextScaleFactor - previousScaleFactor) / previousScaleFactor;
  const { relativeThreshold } = pointQueryDebugDefaults.discScaleChange;
  if (relativeChange <= relativeThreshold) {
    return null;
  }

  return {
    t: performance.now(),
    inputVersion,
    requestedAtMs,
    placementMode,
    source,
    previousScaleFactor,
    nextScaleFactor,
    relativeChange,
    thresholdRelativeChange: relativeThreshold,
  };
};
