import { useCallback, useEffect, useRef } from "react";
import { type Viewer, PerspectiveFrustum } from "cesium";

export interface FovWheelZoomOptions {
  minFov: number;
  maxFov: number;
  fovChangeRate: number;
  enabled?: boolean;
}

export function useFovWheelZoom(
  viewerRef: React.MutableRefObject<Viewer | null>,
  options: FovWheelZoomOptions
) {
  const { minFov, maxFov, fovChangeRate, enabled = true } = options;

  const wheelHandlerRef = useRef<((event: WheelEvent) => void) | null>(null);
  const previousEnableZoomRef = useRef<boolean | null>(null);

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();

      const viewer = viewerRef.current;
      if (!viewer || !viewer.scene) return;

      if (!(viewer.camera.frustum instanceof PerspectiveFrustum)) {
        console.debug("Camera frustum is not PerspectiveFrustum");
        return;
      }

      const currentFov = viewer.camera.frustum.fov || 1;

      const targetFov = currentFov * (1 + event.deltaY * fovChangeRate);

      console.debug(
        `Current FOV: ${currentFov}, Target FOV: ${targetFov}, Delta Y: ${event.deltaY}`
      );

      const newFov = Math.max(minFov, Math.min(maxFov, targetFov));

      if (Math.abs(newFov - currentFov) > 0.0001) {
        viewer.camera.frustum.fov = newFov;
        viewer.scene.requestRender();
      }
    },
    [viewerRef, minFov, maxFov, fovChangeRate]
  );

  const enableWheelZoom = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewer.scene) return;

    const cameraController = viewer.scene.screenSpaceCameraController;

    // Store the current enableZoom state before changing it
    previousEnableZoomRef.current = cameraController.enableZoom;

    // Disable the native zoom behavior
    cameraController.enableZoom = false;

    // Use the current handler function for the event listener
    // This ensures we're using the most up-to-date callback
    const handler = handleWheel;
    wheelHandlerRef.current = handler;

    viewer.canvas.addEventListener("wheel", handler, {
      passive: false,
    });
  }, [viewerRef, handleWheel]);

  const disableWheelZoom = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewer.scene) return;

    // Capture the current handler to ensure we remove the correct one
    const handler = wheelHandlerRef.current;
    if (handler) {
      viewer.canvas.removeEventListener("wheel", handler);
      wheelHandlerRef.current = null;
    }

    // Restore the previous enableZoom state if we have one stored
    const previousEnableZoom = previousEnableZoomRef.current;
    if (previousEnableZoom !== null) {
      const cameraController = viewer.scene.screenSpaceCameraController;
      cameraController.enableZoom = previousEnableZoom;
      previousEnableZoomRef.current = null;
    }
  }, [viewerRef]);

  useEffect(() => {
    if (!enabled) {
      disableWheelZoom();
      return;
    }
    enableWheelZoom();

    return () => {
      disableWheelZoom();
    };
  }, [viewerRef, enabled, enableWheelZoom, disableWheelZoom]);

  const setEnabled = useCallback(
    (isEnabled: boolean) => {
      if (isEnabled) {
        enableWheelZoom();
      } else {
        disableWheelZoom();
      }
    },
    [enableWheelZoom, disableWheelZoom]
  );

  return {
    handleWheel,
    setEnabled,
    isEnabled: Boolean(wheelHandlerRef.current),
  };
}

export default useFovWheelZoom;
