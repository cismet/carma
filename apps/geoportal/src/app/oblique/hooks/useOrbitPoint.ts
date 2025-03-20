import { useState, useEffect, useRef, useCallback } from "react";
import { Cartesian3 } from "cesium";
import { useCesiumContext, getOrbitPoint } from "@carma-mapping/cesium-engine";

import { calculateImageCoordsFromCartesian } from "../utils/obliqueReferenceUtils";
import { useObliqueDataContext } from "./useObliqueDataContext";
import { Proj4Converter } from "../types";

/**
 * Hook to get and convert the orbit point from Cesium
 * This provides the raw orbit point and its coordinates in the image CRS
 * but does not dictate how these coordinates should be used to calculate reference points
 */
export function useOrbitPoint(converter: Proj4Converter): {
  orbitPoint: Cartesian3 | null;
  orbitPointCoords: [number, number, number] | null;
} {
  const { viewerRef } = useCesiumContext();
  const [orbitPoint, setOrbitPoint] = useState<Cartesian3 | null>(null);
  const [orbitPointCoords, setOrbitPointCoords] = useState<
    [number, number, number] | null
  >(null);

  // Use refs to avoid unnecessary rerenders
  const lastPointRef = useRef<Cartesian3 | null>(null);
  const lastCoordsRef = useRef<[number, number, number] | null>(null);

  // Create a memoized update function to avoid recreating it on every render
  const updateOrbitPoint = useCallback(
    (point: Cartesian3 | null) => {
      if (!point) return;

      // Skip update if the point hasn't changed
      if (lastPointRef.current && point.equals(lastPointRef.current)) {
        return;
      }

      //

      lastPointRef.current = point;
      setOrbitPoint(point);

      // Convert to image coordinates
      const coords = calculateImageCoordsFromCartesian(point, converter);

      lastCoordsRef.current = coords;
      setOrbitPointCoords(coords);
    },
    [converter]
  );

  useEffect(() => {
    if (!viewerRef.current || !converter) {
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
  }, [viewerRef, updateOrbitPoint, converter]);

  return { orbitPoint, orbitPointCoords };
}
