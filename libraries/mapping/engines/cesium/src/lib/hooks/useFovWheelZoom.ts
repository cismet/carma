import { useCallback, useEffect, useRef } from "react";
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
      // Block native handlers and SSCC listeners early
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }

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

  // Temporary global wheel blocker while viewer is not yet available.
  // Prevents native Cesium zoom from triggering on reload before our handler attaches.
  const pendingBlockerAttachedRef = useRef(false);
  const pendingWheelBlocker = useCallback(
    (event: WheelEvent) => {
      if (!enabled) return;
      // Block all wheel events while pending to avoid native zoom before handler attaches
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
    },
    [enabled]
  );

  const enableWheelZoom = useCallback(() => {
    let applied = false;
    ctx.withViewer((viewer) => {
      viewer.scene.screenSpaceCameraController.enableZoom = false;

      if (!viewerWheelHandlers.has(viewer)) {
        viewer.canvas.addEventListener("wheel", handleWheel, {
          passive: false,
          capture: true,
        });
        viewerWheelHandlers.set(viewer, handleWheel);
      }
      applied = true;
    });
    // Once applied, remove any pending global blocker
    if (applied && pendingBlockerAttachedRef.current) {
      window.removeEventListener("wheel", pendingWheelBlocker, {
        capture: true as unknown as boolean,
      } as AddEventListenerOptions);
      pendingBlockerAttachedRef.current = false;
    }
    return applied;
  }, [ctx, handleWheel, pendingWheelBlocker]);

  const disableWheelZoom = useCallback(() => {
    let applied = false;
    ctx.withViewer((viewer) => {
      if (viewerWheelHandlers.has(viewer)) {
        const handlerToRemove = viewerWheelHandlers.get(viewer);
        viewer.canvas.removeEventListener(
          "wheel",
          handlerToRemove as (event: WheelEvent) => void,
          true
        );
        viewerWheelHandlers.delete(viewer);
      }

      viewer.scene.screenSpaceCameraController.enableZoom = true;
      applied = true;
    });
    return applied;
  }, [ctx]);

  useEffect(() => {
    let cancelled = false;

    const tryApply = (attemptsLeft: number) => {
      if (cancelled) return;
      const ok = enabled ? enableWheelZoom() : disableWheelZoom();
      if (!ok && attemptsLeft > 0) {
        // Defer until viewer is available; schedule short retries
        requestAnimationFrame(() => tryApply(attemptsLeft - 1));
        // Also nudge render loop in requestRenderMode setups
        ctx.requestRender({ delay: 50, repeat: 1 });
        // Attach a temporary global wheel blocker while pending
        if (enabled && !pendingBlockerAttachedRef.current) {
          window.addEventListener("wheel", pendingWheelBlocker, {
            passive: false,
            capture: true,
          });
          pendingBlockerAttachedRef.current = true;
        }
      }
    };

    tryApply(3); // a few quick retries is sufficient for viewer readiness

    return () => {
      cancelled = true;
      disableWheelZoom();
      if (pendingBlockerAttachedRef.current) {
        window.removeEventListener("wheel", pendingWheelBlocker, {
          capture: true as unknown as boolean,
        } as AddEventListenerOptions);
        pendingBlockerAttachedRef.current = false;
      }
    };
  }, [enabled, enableWheelZoom, disableWheelZoom, ctx, pendingWheelBlocker]);

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
    isEnabled: (() => {
      let flag = false;
      ctx.withViewer((viewer) => {
        flag = viewerWheelHandlers.has(viewer);
      });
      return flag;
    })(),
    pending: (() => {
      // true while viewer isn't available yet
      let hasViewer = false;
      hasViewer = ctx.withViewer(() => {});
      return !hasViewer;
    })(),
  };
}

export default useFovWheelZoom;
