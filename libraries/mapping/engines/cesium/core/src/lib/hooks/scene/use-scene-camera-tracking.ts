import { useEffect } from "react";
import { useCesiumContext } from "../../context/hooks/use-cesium-context";

/**
 * Scene-level hook: Tracks camera position changes with TWO separate states.
 *
 * Architecture:
 * - Internal coordination: Updates refs directly (currentCameraRef, moveendCameraRef)
 * - NO event emission - context reads refs and emits events as needed
 *
 * This hook tracks camera in two ways:
 * 1. **Live tracking** (every frame):
 *    - Updates currentCameraRef for crash recovery and live display
 * 2. **Moveend tracking** (debounced):
 *    - Updates moveendCameraRef when camera stops moving
 *    - Context can subscribe to moveendCameraRef changes and emit events
 *
 * Usage in CesiumSceneComponent:
 * ```tsx
 * useSceneCameraTracking();
 * ```
 */
export const useSceneCameraTracking = () => {
  const {
    sceneRef,
    currentCameraRef,
    moveendCameraRef,
    sceneCameraTrackerRef,
  } = useCesiumContext();
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

          // Capture camera state once (for both current and moveend)
          import("@carma/cesium")
            .then(({ captureCurrentCameraState }) => {
              const cameraState = captureCurrentCameraState(camera, true);

              // Update context's currentCameraRef for crash recovery (every frame)
              if (currentCameraRef) {
                currentCameraRef.current = cameraState;
              }

              // Debounced moveend tracking (like Leaflet moveend/zoomend)
              if (moveendCameraRef) {
                // Clear previous timeout
                if (moveendTimeoutId) {
                  clearTimeout(moveendTimeoutId);
                }

                // Set new timeout - moveend fires if camera doesn't move for MOVEEND_DEBOUNCE_MS
                moveendTimeoutId = setTimeout(() => {
                  // Camera has stopped moving - promote current state to moveend state
                  moveendCameraRef.current = cameraState;
                  console.debug("[Scene] Camera moveend");
                }, MOVEEND_DEBOUNCE_MS);
              }
            })
            .catch((err) => {
              console.error("[Scene] Failed to capture camera state", err);
            });
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
    [sceneRef, currentCameraRef, moveendCameraRef, sceneCameraTrackerRef]
  );
};
