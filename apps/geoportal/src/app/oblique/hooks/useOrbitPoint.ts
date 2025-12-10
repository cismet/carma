import { useState, useEffect } from "react";
import { Cartesian3 } from "@carma/cesium";
import type { Scene } from "@carma/cesium";
import {
  useCesiumContext,
  pickSceneCenter,
} from "@carma-mapping/engines/cesium";

// Shared state across hook instances
let sharedOrbitPoint: Cartesian3 | null = null;
const orbitPointSubscribers: Array<{
  callback: (point: Cartesian3 | null) => void;
  enabled: boolean;
}> = [];
let listenerInitialized = false;

function initOrbitPointListener(scene: Scene) {
  if (listenerInitialized) return;
  listenerInitialized = true;

  const updateOrbitPoint = () => {
    // Check if any subscribers are enabled
    if (!orbitPointSubscribers.some((subscriber) => subscriber.enabled)) return;

    const point = pickSceneCenter(scene);
    if (sharedOrbitPoint && point && point.equalsEpsilon(sharedOrbitPoint, 0.1))
      return;
    sharedOrbitPoint = point;
    orbitPointSubscribers.forEach((subscriber) => {
      if (subscriber.enabled) {
        subscriber.callback(point);
      }
    });
  };

  updateOrbitPoint();
  scene.camera.changed.addEventListener(updateOrbitPoint);
}

export function useOrbitPoint(enabled = true): Cartesian3 | null {
  const { isViewerReady, withScene } = useCesiumContext();
  const [orbitPoint, setOrbitPoint] = useState<Cartesian3 | null>(
    sharedOrbitPoint
  );

  useEffect(() => {
    if (!isViewerReady) return;

    let cleanup;
    withScene((scene) => {
      initOrbitPointListener(scene);

      const subscriber = {
        callback: (point: Cartesian3 | null) => setOrbitPoint(point),
        enabled,
      };
      orbitPointSubscribers.push(subscriber);

      // Trigger an initial update
      if (enabled) {
        subscriber.callback(sharedOrbitPoint);
      }

      cleanup = () => {
        const index = orbitPointSubscribers.indexOf(subscriber);
        if (index > -1) orbitPointSubscribers.splice(index, 1);
      };
    });

    return () => {
      cleanup?.();
    };
  }, [isViewerReady, withScene, enabled]);

  return orbitPoint;
}
