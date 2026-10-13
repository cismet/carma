import { useCallback, useRef } from "react";
import { ecefFromGeographicCoordinate } from "@carma-geo/proj";

import {
  isValidAnnotationEngine,
  type AnnotationEngine,
} from "@carma-mapping/annotations/core";
import type { AnnotationGeographicCoordinate } from "../store";

/**
 * `requestPointAt` of the host api: takes a coordinate the way a click does,
 * with the values of the render it is called in. Stable across renders;
 * false while no tool takes points.
 */
export const useRequestPointAt = (current: {
  engine: AnnotationEngine | null;
  pointQueryEnabled: boolean;
  onPointCreated: (
    coordinate: AnnotationGeographicCoordinate,
    screenPosition?: { x: number; y: number }
  ) => void;
}) => {
  const currentRef = useRef(current);
  currentRef.current = current;
  return useCallback((coordinate: AnnotationGeographicCoordinate) => {
    const { engine, pointQueryEnabled, onPointCreated } = currentRef.current;
    if (!pointQueryEnabled) return false;
    const screenPosition = isValidAnnotationEngine(engine)
      ? engine.worldToScreen(ecefFromGeographicCoordinate(coordinate))
      : null;
    onPointCreated(coordinate, screenPosition ?? undefined);
    return true;
  }, []);
};
