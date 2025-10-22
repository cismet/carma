import { useEffect } from "react";

import { useCesiumContext } from "../../context";
import { CtxEvent } from "../../context/cesium-context-event-map";
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
  const { transitionStateRef, sceneRef, subscribe, suspendSSCCRef } =
    useCesiumContext();

  // Subscribe to all suspension/resume events
  useEffect(() => {
    const unsubAnimStart = subscribe(CtxEvent.AnimationStart, () => {
      console.debug("[SSCC] Animation started - suspending controls");
      suspendSSCCRef.current = true;
      updateSSCC();
    });

    const unsubAnimEnd = subscribe(CtxEvent.AnimationEnd, () => {
      console.debug("[SSCC] Animation ended - checking if can resume");
      suspendSSCCRef.current = false;
      updateSSCC();
    });

    const unsubSuspend = subscribe(CtxEvent.SuspendSSCC, () => {
      console.debug("[SSCC] Explicit suspend requested");
      suspendSSCCRef.current = true;
      updateSSCC();
    });

    const unsubResume = subscribe(CtxEvent.ResumeSSCC, () => {
      console.debug("[SSCC] Explicit resume requested");
      suspendSSCCRef.current = false;
      updateSSCC();
    });

    return () => {
      unsubAnimStart();
      unsubAnimEnd();
      unsubSuspend();
      unsubResume();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe]);

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
