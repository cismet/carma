import { useState, useEffect } from "react";
import { Cartesian3, type Event, Viewer } from "cesium";
import { useCesiumContext } from "./useCesiumContext";
import { getOrbitPoint } from "../utils/cesiumAnimateOrbits";

// Shared state across hook instances
let sharedOrbitPoint: Cartesian3 | null = null;
const orbitPointSubscribers: Array<(point: Cartesian3 | null) => void> = [];
let listenerInitialized = false;
let eventHandler: Event.RemoveCallback | null = null;

function initOrbitPointListener(viewer: Viewer) {
  if (listenerInitialized) return;
  listenerInitialized = true;

  const updateOrbitPoint = () => {
    const point = getOrbitPoint(viewer)?.position;
    if (!point || (sharedOrbitPoint && point.equals(sharedOrbitPoint))) return;
    sharedOrbitPoint = point;
    orbitPointSubscribers.forEach((callback) => callback(point));
  };

  updateOrbitPoint();
  eventHandler = viewer.camera.changed.addEventListener(updateOrbitPoint);
}

function cleanupOrbitPointListener(viewer: Viewer) {
  if (eventHandler) {
    viewer.camera.changed.removeEventListener(eventHandler);
    eventHandler = null;
  }
  listenerInitialized = false;
}

export function useCesiumOrbitPoint(): Cartesian3 | null {
  const { viewerRef } = useCesiumContext();
  const [orbitPoint, setOrbitPoint] = useState<Cartesian3 | null>(
    sharedOrbitPoint
  );

  useEffect(() => {
    const viewer = viewerRef.current;
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
      if (orbitPointSubscribers.length === 0) {
        cleanupOrbitPointListener(viewer);
      }
    };
  }, [viewerRef]);

  return orbitPoint;
}

export default useCesiumOrbitPoint;
