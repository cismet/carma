import { useEffect } from "react";

import { useCesiumContext } from "../../context";
import {
  isValidScene,
  isValidScreenSpaceCameraController,
} from "../../utils/lazy-validators";

/**
 * Manages ScreenSpaceCameraController (SSCC) enabling/disabling based on:
 * - Transition state (suspend during transitions)
 * - Animation state (suspend during animations)
 * - Explicit suspend/resume events (for external control)
 *
 * Uses event bus to coordinate SSCC state across the system.
 */
export const useDisableSSCC = () => {
  console.debug("HOOKINIT [CESIUM|SCENE] useDisableSSCC");
  const { transitionStateRef, sceneRef, suspendSSCCRef } = useCesiumContext();

  // Event subscriptions removed - using direct ref polling instead
  useEffect(() => {
    const checkSSCCState = () => {
      updateSSCC();
      // Check again in 100ms
      setTimeout(checkSSCCState, 100);
    };

    // Start checking immediately
    checkSSCCState();
  }, []);

  const shouldBlockUserInput = (state: unknown): boolean => {
    const transitionStates = [
      "preTransitionTo2d",
      "transitionTo2d",
      "preTransitionTo3d",
      "transitionTo3d",
    ];
    return transitionStates.includes(String(state));
  };

  const updateSSCC = () => {
    const scene = sceneRef.current;
    if (!isValidScene(scene) || !scene) return;

    const sccc = scene.screenSpaceCameraController;
    if (!isValidScreenSpaceCameraController(sccc)) return;

    const isEnabled =
      !suspendSSCCRef.current &&
      !shouldBlockUserInput(transitionStateRef.current);

    console.info("HOOK [CESIUM|SCENE|SSCC] updating controls", { isEnabled });

    try {
      sccc.enableRotate = isEnabled;
      sccc.enableZoom = isEnabled;
      sccc.enableTilt = isEnabled;
    } catch (e) {
      console.error(
        "HOOK [CESIUM|SCENE|SSCC] error setting map interaction",
        e
      );
    }
  };
};
