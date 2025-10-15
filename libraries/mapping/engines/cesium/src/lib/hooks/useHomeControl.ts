import { useCallback, useState, useEffect } from "react";

import { BoundingSphere, Cartesian3 } from "cesium";

import { useCesiumContext } from "./useCesiumContext";
import { CtxEvent } from "../cesiumContextEventMap";
import { tryWithValidCamera } from "../utils/instanceGates";

export const useHomeControl = () => {
  const { sceneRef, emit, homePositionRef } = useCesiumContext();

  const [homePos, setHomePos] = useState<Cartesian3 | null>(null);

  useEffect(() => {
    const home = homePositionRef.current;
    if (home) {
      setHomePos(new Cartesian3(home.x, home.y, home.z));
    }
  }, [homePositionRef]);

  const handleHomeClick = useCallback(() => {
    console.debug("homePos click", homePos);
    // Notify subscribers that a Home fly has been triggered (hide overlays, etc.)
    emit?.(CtxEvent.GoHome, undefined);
    const scene = sceneRef.current;
    if (homePos && scene) {
      // Clear any ongoing animation
      emit(CtxEvent.AnimationEnd, undefined);
      const boundingSphere = new BoundingSphere(homePos, 400);
      console.debug("HOOK: [2D3D|CESIUM|CAMERA] homeClick");
      tryWithValidCamera(scene.camera, (camera) => {
        camera.flyToBoundingSphere(boundingSphere);
      });
    }
  }, [sceneRef, homePos, emit]);

  return handleHomeClick;
};
