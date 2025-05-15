import { useState, useEffect } from "react";
import { Cartesian3, Viewer } from "cesium";
import { useCesiumContext, getOrbitPoint } from "@carma-mapping/cesium-engine";

// Shared state across hook instances
let sharedOrbitPoint: Cartesian3 | null = null;
const orbitPointSubscribers: Array<{
  callback: (point: Cartesian3 | null) => void;
  enabled: boolean;
}> = [];
let listenerInitialized = false;

function initOrbitPointListener(viewer: Viewer) {
  if (listenerInitialized) return;
  listenerInitialized = true;

  const updateOrbitPoint = () => {
    // Check if any subscribers are enabled
    if (!orbitPointSubscribers.some((subscriber) => subscriber.enabled)) return;

    const point = getOrbitPoint(viewer);
    if (sharedOrbitPoint && point && point.equals(sharedOrbitPoint)) return;
    sharedOrbitPoint = point;
    orbitPointSubscribers.forEach((subscriber) => {
      if (subscriber.enabled) {
        subscriber.callback(point);
      }
    });
  };

  updateOrbitPoint();
  viewer.camera.changed.addEventListener(updateOrbitPoint);
}

export function useOrbitPoint(enabled = true): Cartesian3 | null {
  const { viewerRef, isViewerReady } = useCesiumContext();
  const [orbitPoint, setOrbitPoint] = useState<Cartesian3 | null>(
    sharedOrbitPoint
  );

  useEffect(() => {
    if (!isViewerReady) return;

    const viewer = viewerRef.current;
    if (!viewer) return;
    initOrbitPointListener(viewer);

    const subscriber = {
      callback: (point: Cartesian3 | null) => setOrbitPoint(point),
      enabled,
    };
    orbitPointSubscribers.push(subscriber);

    // Trigger an initial update
    if (enabled) {
      subscriber.callback(sharedOrbitPoint);
    }

    return () => {
      const index = orbitPointSubscribers.indexOf(subscriber);
      if (index > -1) orbitPointSubscribers.splice(index, 1);
    };
  }, [viewerRef, isViewerReady, enabled]);

  return orbitPoint;
}
