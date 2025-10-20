import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { Scene } from "@carma/cesium";
import { cesiumCameraForceOblique } from "../scene/camera/cesium-camera-force-oblique";

export const useCesiumCameraForceOblique = (
  sceneRef: MutableRefObject<Scene | null>,
  fixedPitch: number,
  fixedHeight: number,
  shouldSuspendRef: MutableRefObject<boolean>
) => {
  const handlerRef = useRef<(() => void) | null>(null);

  // Warn about temporary workaround
  useEffect(() => {
    console.warn(
      "[TEMP] useCesiumCameraForceOblique is a temporary workaround. " +
        "Should be replaced with unified camera limiter. " +
        "See: .dev-local/docs/specs/oblique-mode-simplification/"
    );
  }, []);

  const enableCameraForceOblique = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove existing handler if any
    if (handlerRef.current) {
      scene.preUpdate.removeEventListener(handlerRef.current);
    }

    // Create and attach new handler
    const handler = () => {
      cesiumCameraForceOblique(
        scene,
        fixedPitch,
        fixedHeight,
        shouldSuspendRef
      );
    };

    scene.preUpdate.addEventListener(handler);
    handlerRef.current = handler;
  }, [sceneRef, fixedPitch, fixedHeight, shouldSuspendRef]);

  const disableCameraForceOblique = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene || !handlerRef.current) return;

    scene.preUpdate.removeEventListener(handlerRef.current);
    handlerRef.current = null;
  }, [sceneRef]);

  return { enableCameraForceOblique, disableCameraForceOblique };
};
