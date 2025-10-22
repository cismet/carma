import { useEffect, type MutableRefObject } from "react";
import { radToDeg } from "@carma/units/helpers";
import type { CesiumWidget, Scene } from "@carma/cesium";
import {
  CtxEvent,
  type EmitCesiumCtxFn,
  type SubscribeCesiumCtxFn,
} from "../cesium-context-event-map";

export const useContextSetupCameraTracking = (
  widgetRef: MutableRefObject<CesiumWidget | null>,
  sceneRef: MutableRefObject<Scene | null>,
  subscribe: SubscribeCesiumCtxFn,
  emit: EmitCesiumCtxFn
) => {
  useEffect(
    function setupCameraPositionTracking() {
      let cameraListener: (() => void) | null = null;

      const attachCameraTracking = () => {
        if (cameraListener) return; // Already attached

        const widget = widgetRef.current;
        const scene = sceneRef.current;

        if (!widget || !scene?.camera) {
          console.debug(
            "[CesiumContext] Camera tracking skipped - widget or scene not ready"
          );
          return;
        }

        const handleCameraPositionChange = () => {
          const camera = sceneRef.current?.camera;
          if (!camera) return;

          const pos = camera.positionCartographic;
          if (!pos) return;

          emit(CtxEvent.CameraChanged, {
            lat: radToDeg(pos.latitude),
            lng: radToDeg(pos.longitude),
            alt: pos.height,
          });
        };

        cameraListener = handleCameraPositionChange;

        // Emit initial position
        handleCameraPositionChange();

        // Subscribe to camera changes
        scene.camera.changed.addEventListener(handleCameraPositionChange);
        console.debug("[CesiumContext] Camera position tracking attached");
      };

      // Try immediately
      attachCameraTracking();

      // Also listen for SceneReady (refs might not be set yet on first render)
      const unsubscribe = subscribe(CtxEvent.SceneReady, attachCameraTracking);

      return () => {
        unsubscribe();
        const scene = sceneRef.current;
        if (cameraListener && scene?.camera) {
          scene.camera.changed.removeEventListener(cameraListener);
          console.debug("[CesiumContext] Camera position tracking detached");
        }
      };
    },
    [widgetRef, sceneRef, subscribe, emit]
  );
};
