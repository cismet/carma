import { useEffect } from "react";
import { captureCurrentCameraState } from "@carma/cesium";
import { useCesiumContext } from "../../context/hooks/use-cesium-context";

/**
 * Scene-level hook: Tracks camera position changes with TWO separate states.
 * *
 * This hook tracks camera in two ways:
 * 1. **Live tracking** (every frame):
 *    - Updates cameraRef through context for crash recovery and live display
 * 2. **Moveend tracking** (debounced):
 *    - Updates moveendCameraRef through context when camera stops moving
 *    - Context can subscribe to moveendCameraRef changes and emit events
 *
 * Usage in CesiumSceneComponent:
 * ```tsx
 * useSceneCameraTracking();
 * ```
 */
export const useSceneCameraTracking = () => {
  const { sceneRef, setCamera, setMoveEndCamera, sceneCameraTrackerRef } =
    useCesiumContext();
  useEffect(
    function setupCameraPositionTracking() {
      let cameraListener: (() => void) | null = null;
      let moveendTimeoutId: NodeJS.Timeout | null = null;
      const MOVEEND_DEBOUNCE_MS = 100; // Camera moveend fires after 500ms of no movement

      const attachCameraTracking = () => {
        if (cameraListener) return; // Already attached

        const scene = sceneRef.current;

        if (!scene?.camera) {
          console.debug("[Scene] Camera tracking skipped - scene not ready");
          return;
        }

        const handleCameraPositionChange = () => {
          const camera = sceneRef.current?.camera;
          if (!camera) return;
          const cameraState = captureCurrentCameraState(camera, true);

          // Capture camera state once (for both current and moveend)
          // Update context's currentCameraRef for crash recovery (every frame)
          if (setCamera) {
            console.debug(
              "[Scene] Camera position changed - setting current camera"
            );
            setCamera(cameraState);
          }
          // Debounced moveend tracking (like Leaflet moveend/zoomend)
          if (setMoveEndCamera) {
            // Clear previous timeout
            if (moveendTimeoutId) {
              clearTimeout(moveendTimeoutId);
            }
            // Set new timeout - moveend fires if camera doesn't move for MOVEEND_DEBOUNCE_MS
            moveendTimeoutId = setTimeout(() => {
              // Camera has stopped moving - promote current state to moveend state
              if (setMoveEndCamera) {
                console.debug(
                  "[Scene] Camera moveend - setting moveend camera"
                );
                setMoveEndCamera(cameraState);
              }
            }, MOVEEND_DEBOUNCE_MS);
          }
        };

        cameraListener = handleCameraPositionChange;

        // Emit initial position
        handleCameraPositionChange();

        // Subscribe to camera changes
        scene.camera.changed.addEventListener(handleCameraPositionChange);
        console.debug("[Scene] Camera position tracking attached");
      };

      // Register camera tracker callback with context
      // Context can call this to start/stop camera tracking
      const startStopTracking = (action: "start" | "stop") => {
        if (action === "start") {
          attachCameraTracking();
        } else {
          // Stop tracking
          const scene = sceneRef.current;
          if (cameraListener && scene?.camera) {
            scene.camera.changed.removeEventListener(cameraListener);
            cameraListener = null;
            console.debug("[Scene] Camera position tracking stopped");
          }
          if (moveendTimeoutId) {
            clearTimeout(moveendTimeoutId);
            moveendTimeoutId = null;
          }
        }
      };

      sceneCameraTrackerRef.current = startStopTracking;
      console.log("[Scene] Registered camera tracker with context");

      // Start tracking immediately
      startStopTracking("start");

      return () => {
        sceneCameraTrackerRef.current = null;
        console.log("[Scene] Unregistered camera tracker from context");
        startStopTracking("stop");
      };
    },
    [sceneRef, setCamera, setMoveEndCamera, sceneCameraTrackerRef]
  );
};
