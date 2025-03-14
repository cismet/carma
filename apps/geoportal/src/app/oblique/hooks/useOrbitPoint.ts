import { useState, useEffect } from "react";
import { Cartesian3 } from "cesium";
import { useCesiumContext, getOrbitPoint } from "@carma-mapping/cesium-engine";
import type { Converter } from "proj4";

import { calculateImageCoordsFromCartesian } from "../utils/obliqueReferenceUtils";

/**
 * Hook to get and convert the orbit point from Cesium
 * This provides the raw orbit point and its coordinates in the image CRS
 * but does not dictate how these coordinates should be used to calculate reference points
 */
export function useOrbitPoint(converter?: Converter): {
  orbitPoint: Cartesian3 | null;
  orbitPointCoords: [number, number, number] | null;
} {
  const { viewerRef } = useCesiumContext();
  const [orbitPoint, setOrbitPoint] = useState<Cartesian3 | null>(null);
  const [orbitPointCoords, setOrbitPointCoords] = useState<
    [number, number, number] | null
  >(null);

  useEffect(() => {
    if (!viewerRef.current || !converter) {
      return;
    }

    const viewer = viewerRef.current;

    // Get the orbit point from Cesium
    const point = getOrbitPoint(viewer);

    // Only proceed if we got a valid orbit point
    if (point) {
      setOrbitPoint(point);

      // Convert to image coordinates
      const coords = calculateImageCoordsFromCartesian(point, converter);
      setOrbitPointCoords(coords);
    }

    // Update when camera changes
    const onCameraChange = () => {
      const updatedPoint = getOrbitPoint(viewer);
      if (updatedPoint) {
        setOrbitPoint(updatedPoint);
        setOrbitPointCoords(
          calculateImageCoordsFromCartesian(updatedPoint, converter)
        );
      }
    };

    viewer.camera.changed.addEventListener(onCameraChange);
    return () => {
      viewer.camera.changed.removeEventListener(onCameraChange);
    };
  }, [viewerRef, converter]);

  return { orbitPoint, orbitPointCoords };
}
