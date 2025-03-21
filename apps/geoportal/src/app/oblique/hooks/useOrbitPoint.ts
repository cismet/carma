import { useState, useEffect } from "react";
import { Cartesian3 } from "cesium";
import { useCesiumContext, getOrbitPoint } from "@carma-mapping/cesium-engine";

import { calculateImageCoordsFromCartesian } from "../utils/obliqueReferenceUtils";
import { Proj4Converter } from "../types";

// Shared state across hook instances
let sharedOrbitPoint: Cartesian3 | null = null;
const orbitPointSubscribers: Array<(point: Cartesian3 | null) => void> = [];
let listenerInitialized = false;

function initOrbitPointListener(viewer: any) {
  if (listenerInitialized) return;
  listenerInitialized = true;

  const updateOrbitPoint = () => {
    const point = getOrbitPoint(viewer);
    if (sharedOrbitPoint && point && point.equals(sharedOrbitPoint)) return;
    sharedOrbitPoint = point;
    orbitPointSubscribers.forEach((callback) => callback(point));
  };

  updateOrbitPoint();
  viewer.camera.changed.addEventListener(updateOrbitPoint);
}

export function useOrbitPoint(converter: Proj4Converter): {
  orbitPoint: Cartesian3 | null;
  orbitPointCoords: [number, number, number] | null;
} {
  const { viewerRef } = useCesiumContext();
  const [orbitPoint, setOrbitPoint] = useState<Cartesian3 | null>(
    sharedOrbitPoint
  );
  const [orbitPointCoords, setOrbitPointCoords] = useState<
    [number, number, number] | null
  >(
    sharedOrbitPoint
      ? calculateImageCoordsFromCartesian(sharedOrbitPoint, converter)
      : null
  );

  useEffect(() => {
    if (!viewerRef.current) return;
    initOrbitPointListener(viewerRef.current);

    const callback = (point: Cartesian3 | null) => {
      setOrbitPoint(point);
      setOrbitPointCoords(
        point ? calculateImageCoordsFromCartesian(point, converter) : null
      );
    };

    orbitPointSubscribers.push(callback);
    callback(sharedOrbitPoint);

    return () => {
      const index = orbitPointSubscribers.indexOf(callback);
      if (index > -1) orbitPointSubscribers.splice(index, 1);
    };
  }, [viewerRef, converter]);

  return { orbitPoint, orbitPointCoords };
}
