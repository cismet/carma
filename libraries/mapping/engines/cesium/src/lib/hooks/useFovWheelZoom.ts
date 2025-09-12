import { useCallback, useEffect } from "react";
import { Math as CesiumMath, PerspectiveFrustum, type Viewer } from "cesium";
import type { CesiumContextType } from "../CesiumContext";

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
  ctx: CesiumContextType,
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

      ctx.withCamera((camera) => {
        if (!(camera.frustum instanceof PerspectiveFrustum)) {
          console.debug("Camera frustum is not PerspectiveFrustum");
          return;
        }

        const currentFov = camera.frustum.fov || 1;

        const deltaSign = Math.sign(event.deltaY);

        const deltaYNormalized = Math.sqrt(Math.abs(event.deltaY)) * deltaSign;

        const targetFov = currentFov * (1 + deltaYNormalized * fovChangeRate);

        const newFov = Math.max(minFov, Math.min(maxFov, targetFov));

        if (Math.abs(newFov - currentFov) > 0.0001) {
          camera.frustum.fov = newFov;
          ctx.requestRender();
        }
      });
    },
    [ctx, minFov, maxFov, fovChangeRate]
  );

  const enableWheelZoom = useCallback(() => {
    ctx.withViewer((viewer) => {
      viewer.scene.screenSpaceCameraController.enableZoom = false;

      if (!viewerWheelHandlers.has(viewer)) {
        viewer.canvas.addEventListener("wheel", handleWheel, {
          passive: false,
        });

        viewerWheelHandlers.set(viewer, handleWheel);
      }
    });
  }, [ctx, handleWheel]);

  const disableWheelZoom = useCallback(() => {
    ctx.withViewer((viewer) => {
      if (viewerWheelHandlers.has(viewer)) {
        const handlerToRemove = viewerWheelHandlers.get(viewer);
        viewer.canvas.removeEventListener(
          "wheel",
          handlerToRemove as (event: WheelEvent) => void
        );
        viewerWheelHandlers.delete(viewer);
      }

      viewer.scene.screenSpaceCameraController.enableZoom = true;
    });
  }, [ctx]);

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
    isEnabled:
      ctx.withViewer((viewer) => viewerWheelHandlers.has(viewer)) || false,
  };
}

export default useFovWheelZoom;
