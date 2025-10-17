import { useState, useEffect } from "react";
import { Cartesian3, Scene } from "cesium";
import {
  useCesiumContext,
  getOrbitPoint,
} from "@carma-mapping/engines/cesium/core";

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

    const point = getOrbitPoint(scene);
    if (sharedOrbitPoint && point && point.equals(sharedOrbitPoint)) return;
    sharedOrbitPoint = point ?? null;
    orbitPointSubscribers.forEach((subscriber) => {
      if (subscriber.enabled) {
        subscriber.callback(sharedOrbitPoint);
      }
    });
  };

  updateOrbitPoint();
  scene.camera.changed.addEventListener(updateOrbitPoint);
}

export function useOrbitPoint(enabled = true): Cartesian3 | null {
  const { sceneRef } = useCesiumContext();
  const [orbitPoint, setOrbitPoint] = useState<Cartesian3 | null>(
    sharedOrbitPoint
  );

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
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

    return () => {
      const index = orbitPointSubscribers.indexOf(subscriber);
      if (index > -1) orbitPointSubscribers.splice(index, 1);
    };
  }, [sceneRef, enabled]);

  return orbitPoint;
}
