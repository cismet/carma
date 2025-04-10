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

      const deltaSign = Math.sign(event.deltaY);

      // dampen the larger deltas by a square root for smoother zooming
      // TODO: consider using accumulating deltas and running an independent fov change animation
      const deltaYNormalized = Math.sqrt(Math.abs(event.deltaY)) * deltaSign;

      const targetFov = currentFov * (1 + deltaYNormalized * fovChangeRate);

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

    // Disable the native zoom behavior
    viewer.scene.screenSpaceCameraController.enableZoom = false;

    wheelHandlerRef.current = handleWheel;

    viewer.canvas.addEventListener("wheel", handleWheel, {
      passive: false,
    });
  }, [viewerRef, handleWheel]);

  const disableWheelZoom = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewer.scene) return;

    const handler = wheelHandlerRef.current;
    if (handler) {
      viewer.canvas.removeEventListener("wheel", handler);
      wheelHandlerRef.current = null;
    }
    viewer.scene.screenSpaceCameraController.enableZoom = true;
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
