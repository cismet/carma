import { useCallback } from "react";

import { BoundingSphere, Cartesian3 } from "cesium";

import { useCesiumContext } from "../context";
import { CtxEvent } from "../context/cesiumContextEventMap";
import { tryWithValidCamera } from "../helpers/Scene/Camera";

export const useHomeControl = () => {
  const { sceneRef, emit, homePositionRef } = useCesiumContext();

  const handleHomeClick = useCallback(() => {
    const home = homePositionRef.current;
    console.log("[HOME CONTROL] Click - homePositionRef.current:", home);

    // Notify subscribers that a Home fly has been triggered (hide overlays, etc.)
    emit?.(CtxEvent.GoHome, undefined);

    const scene = sceneRef.current;
    console.log("[HOME CONTROL] scene:", !!scene, "home:", !!home);

    if (home && scene) {
      // Clear any ongoing animation
      emit(CtxEvent.AnimationEnd, undefined);

      const homePos = new Cartesian3(home.x, home.y, home.z);
      const boundingSphere = new BoundingSphere(homePos, 400);

      console.log("[HOME CONTROL] Flying to home:", homePos);

      tryWithValidCamera(scene.camera, (camera) => {
        camera.flyToBoundingSphere(boundingSphere);
      });
    } else {
      console.warn(
        "[HOME CONTROL] Cannot fly home - missing scene or home position"
      );
    }
  }, [sceneRef, homePositionRef, emit]);

  return handleHomeClick;
};
