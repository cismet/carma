import { useState, useEffect, useRef, useCallback } from "react";
import { Cartesian3 } from "cesium";
import { useCesiumContext, getOrbitPoint } from "@carma-mapping/cesium-engine";

import { calculateImageCoordsFromCartesian } from "../utils/obliqueReferenceUtils";
import { Proj4Converter } from "../types";

/**
 * Hook to get and convert the orbit point from Cesium
 * This provides the raw orbit point and its coordinates in the image CRS
 * but does not dictate how these coordinates should be used to calculate reference points
 */
export function useOrbitPoint(converterObj: Proj4Converter | null): {
  orbitPoint: Cartesian3 | null;
  orbitPointCoords: [number, number, number] | null;
} {
  const { viewerRef } = useCesiumContext();
  const [orbitPoint, setOrbitPoint] = useState<Cartesian3 | null>(null);
  const [orbitPointCoords, setOrbitPointCoords] = useState<
    [number, number, number] | null
  >(null);

  // Use refs to avoid unnecessary rerenders
  const converterRef = useRef(converterObj);
  const lastPointRef = useRef<Cartesian3 | null>(null);
  const lastCoordsRef = useRef<[number, number, number] | null>(null);

  // Update converter ref when it changes
  useEffect(() => {
    converterRef.current = converterObj;
  }, [converterObj]);

  // Memoize the return object to prevent consumer rerenders
  const returnRef = useRef({
    orbitPoint,
    orbitPointCoords,
  });

  // Update return ref when state changes
  useEffect(() => {
    returnRef.current = {
      orbitPoint,
      orbitPointCoords,
    };
  }, [orbitPoint, orbitPointCoords]);

  // Create a memoized update function to avoid recreating it on every render
  const updateOrbitPoint = useCallback((point: Cartesian3 | null) => {
    if (!point || !converterRef.current) return;

    // Skip update if the point hasn't changed significantly
    if (lastPointRef.current && point.equals(lastPointRef.current)) {
      return;
    }

    lastPointRef.current = point;
    setOrbitPoint(point);

    // Convert to image coordinates
    const coords = calculateImageCoordsFromCartesian(
      point,
      converterRef.current
    );

    // If coords is null, we can't proceed
    if (!coords) return;

    // Skip update if coords haven't changed significantly
    if (
      lastCoordsRef.current &&
      coords[0] === lastCoordsRef.current[0] &&
      coords[1] === lastCoordsRef.current[1] &&
      coords[2] === lastCoordsRef.current[2]
    ) {
      return;
    }

    lastCoordsRef.current = coords;
    setOrbitPointCoords(coords);
  }, []);

  useEffect(() => {
    if (!viewerRef.current || !converterRef.current) {
      return;
    }

    const viewer = viewerRef.current;

    // Get the orbit point from Cesium
    const point = getOrbitPoint(viewer);
    updateOrbitPoint(point);

    // Update when camera changes
    const onCameraChange = () => {
      const updatedPoint = getOrbitPoint(viewer);
      updateOrbitPoint(updatedPoint);
    };

    viewer.camera.changed.addEventListener(onCameraChange);
    return () => {
      viewer.camera.changed.removeEventListener(onCameraChange);
    };
  }, [viewerRef, updateOrbitPoint]);

  return returnRef.current;
}
