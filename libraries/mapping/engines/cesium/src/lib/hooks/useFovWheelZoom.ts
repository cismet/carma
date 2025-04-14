import { useCallback, useEffect } from "react";
import { Math as CesiumMath, PerspectiveFrustum, type Viewer } from "cesium";

const viewerWheelHandlers = new WeakMap<Viewer, (event: WheelEvent) => void>();

export interface FovWheelZoomOptions {
  minFov?: number;
  maxFov?: number;
  fovChangeRate?: number;
}

const defaultFovWheelZoomOptions: Required<FovWheelZoomOptions> = {
  minFov: CesiumMath.toRadians(10), // Minimum field of view in radians
  maxFov: CesiumMath.toRadians(120), // Maximum field of view in radians
  fovChangeRate: 0.01,
};

export function useFovWheelZoom(
  viewer: Viewer | undefined,
  enabled: boolean = true,
  options: FovWheelZoomOptions = {}
) {
  const { minFov, maxFov, fovChangeRate } = {
    ...defaultFovWheelZoomOptions,
    ...options,
  };

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();

      if (!viewer || !viewer.scene) return;

      if (!(viewer.camera.frustum instanceof PerspectiveFrustum)) {
        console.debug("Camera frustum is not PerspectiveFrustum");
        return;
      }

      const currentFov = viewer.camera.frustum.fov || 1;

      const deltaSign = Math.sign(event.deltaY);

      const deltaYNormalized = Math.sqrt(Math.abs(event.deltaY)) * deltaSign;

      const targetFov = currentFov * (1 + deltaYNormalized * fovChangeRate);

      const newFov = Math.max(minFov, Math.min(maxFov, targetFov));

      if (Math.abs(newFov - currentFov) > 0.0001) {
        viewer.camera.frustum.fov = newFov;
        viewer.scene.requestRender();
      }
    },
    [viewer, minFov, maxFov, fovChangeRate]
  );

  const enableWheelZoom = useCallback(() => {
    if (!viewer || !viewer.scene) return;

    viewer.scene.screenSpaceCameraController.enableZoom = false;

    if (!viewerWheelHandlers.has(viewer)) {
      viewer.canvas.addEventListener("wheel", handleWheel, {
        passive: false,
      });

      viewerWheelHandlers.set(viewer, handleWheel);
    }
  }, [viewer, handleWheel]);

  const disableWheelZoom = useCallback(() => {
    if (!viewer || !viewer.scene) return;

    if (viewerWheelHandlers.has(viewer)) {
      const handlerToRemove = viewerWheelHandlers.get(viewer);
      viewer.canvas.removeEventListener(
        "wheel",
        handlerToRemove as (event: WheelEvent) => void
      );
      viewerWheelHandlers.delete(viewer);
    }

    viewer.scene.screenSpaceCameraController.enableZoom = true;
  }, [viewer]);

  useEffect(() => {
    if (!enabled) {
      disableWheelZoom();
      return;
    }
    enableWheelZoom();

    return () => {
      disableWheelZoom();
    };
  }, [enabled, enableWheelZoom, disableWheelZoom]);

  useEffect(() => {
    if (!viewer) return;

    const checkViewerReady = () => {
      if (viewer.canvas.width > 0 && viewer.scene) {
        console.debug("Viewer is ready for rendering");
        // Perform any additional setup or callback here
      } else {
        console.debug("Viewer canvas not ready, retrying...");
        requestAnimationFrame(checkViewerReady);
      }
    };

    checkViewerReady();
  }, [viewer]);

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
    isEnabled: Boolean(
      viewer && viewerWheelHandlers.has(viewer)
    ),
  };
}

export default useFovWheelZoom;
