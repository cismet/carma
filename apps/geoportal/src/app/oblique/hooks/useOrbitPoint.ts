import { useState, useEffect } from "react";
import { Cartesian3, Viewer } from "cesium";
import { useCesiumContext, getOrbitPoint } from "@carma-mapping/cesium-engine";

// Shared state across hook instances
let sharedOrbitPoint: Cartesian3 | null = null;
const orbitPointSubscribers: Array<(point: Cartesian3 | null) => void> = [];
let listenerInitialized = false;

function initOrbitPointListener(viewer: Viewer) {
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

export function useOrbitPoint(): Cartesian3 | null {
  const { viewer } = useCesiumContext();
  const [orbitPoint, setOrbitPoint] = useState<Cartesian3 | null>(
    sharedOrbitPoint
  );

  useEffect(() => {
    if (!viewer) return;
    initOrbitPointListener(viewer);

    const callback = (point: Cartesian3 | null) => {
      setOrbitPoint(point);
    };

    orbitPointSubscribers.push(callback);
    callback(sharedOrbitPoint);

    return () => {
      const index = orbitPointSubscribers.indexOf(callback);
      if (index > -1) orbitPointSubscribers.splice(index, 1);
    };
  }, [viewer]);

  return orbitPoint;
}
