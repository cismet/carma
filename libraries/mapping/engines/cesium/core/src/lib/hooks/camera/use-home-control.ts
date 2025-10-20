import { useCallback } from "react";

import { BoundingSphere, tryWithValidCamera, flyToTarget } from "@carma/cesium";

import { useCesiumContext } from "../../context";
import { CtxEvent } from "../../context/cesium-context-event-map";

export const useHomeControl = () => {
  const { sceneRef, emit, homeRef } = useCesiumContext();

  const handleHomeClick = useCallback(() => {
    const home = homeRef.current;
    console.log("[HOME CONTROL] Click - homeRef.current:", home);

    // Notify subscribers that a Home fly has been triggered (hide overlays, etc.)
    emit?.(CtxEvent.GoHome, undefined);

    const scene = sceneRef.current;
    console.log("[HOME CONTROL] scene:", !!scene, "home:", !!home);

    if (!home) {
      console.warn("[HOME CONTROL] No home config available");
      return;
    }

    if (!scene || scene.isDestroyed?.()) {
      console.warn("[HOME CONTROL] Scene not ready or destroyed");
      return;
    }

    if (home && scene) {
      // Clear any ongoing animation
      emit(CtxEvent.AnimationEnd, undefined);

      const { target, orientation } = home;

      console.log(
        "[HOME CONTROL] Flying to home:",
        target,
        "orientation:",
        orientation
      );

      tryWithValidCamera(scene.camera, (camera) => {
        if (orientation) {
          // Use flyToTarget with 2 second animation
          flyToTarget(camera, target, orientation, 2.0);
        } else {
          // Fallback: use bounding sphere around target
          const boundingSphere = new BoundingSphere(target, 400);
          camera.flyToBoundingSphere(boundingSphere, { duration: 2.0 });
        }
      });
    } else {
      console.warn(
        "[HOME CONTROL] Cannot fly home - missing scene or home config"
      );
    }
  }, [sceneRef, homeRef, emit]);

  return handleHomeClick;
};
