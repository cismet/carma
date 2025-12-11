import { useEffect } from "react";

import { guardScreenSpaceCameraController } from "../utils/guardScreenSpaceCameraController";
import { useCesiumContext } from "./useCesiumContext";

/**
 * Disables SSCC (ScreenSpaceCameraController) interactions while animations are running.
 * Uses sceneAnimationMap to detect active animations.
 */
const useDisableSSCC = () => {
  const { withViewer, withScene, isAnimating, sceneAnimationMapRef } =
    useCesiumContext();

  useEffect(() => {
    // Set up a preUpdate listener to check animation state each frame
    let removeListener: (() => void) | null = null;

    withScene((scene) => {
      const onPreUpdate = () => {
        const animating = isAnimating();
        withViewer((viewer) => {
          guardScreenSpaceCameraController(
            viewer.scene.screenSpaceCameraController,
            "useDisableSSCC"
          )
            .enableRotate(!animating)
            .enableZoom(!animating)
            .enableTilt(!animating);
        });
      };

      scene.preUpdate.addEventListener(onPreUpdate);
      removeListener = () => scene.preUpdate.removeEventListener(onPreUpdate);
    });

    return () => {
      removeListener?.();
    };
  }, [withViewer, withScene, isAnimating, sceneAnimationMapRef]);
};

export default useDisableSSCC;
