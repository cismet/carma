import { useCallback, useRef } from "react";
import { Math as CesiumMath, PerspectiveFrustum, type Viewer } from "cesium";
import type { CesiumContextType } from "../CesiumContext";
import { useBlockDefaultZoomBehaviour } from "./useBlockDefaultZoomBehaviour";

const viewerWheelHandlers = new WeakMap<Viewer, (event: WheelEvent) => void>();

export interface FovWheelZoomOptions {
  minFov?: number;
  maxFov?: number;
  fovChangeRate?: number;
  onAfterFovChange?: () => void;
  onFovChange?: (newFov: number, previousFov: number) => void;
}

const DEFAULT_MIN_FOV = CesiumMath.toRadians(10);
const DEFAULT_MAX_FOV = CesiumMath.toRadians(120);
const DEFAULT_FOV_CHANGE_RATE = 0.01;

const defaultFovWheelZoomOptions: FovWheelZoomOptions = {
  minFov: DEFAULT_MIN_FOV,
  maxFov: DEFAULT_MAX_FOV,
  fovChangeRate: DEFAULT_FOV_CHANGE_RATE,
};

const blockWheelEvent = (event: WheelEvent) => {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
};

const computeNextFov = (
  current: number,
  deltaY: number,
  min: number,
  max: number,
  rate: number
) => {
  const sign = Math.sign(deltaY);
  const normalized = Math.sqrt(Math.abs(deltaY)) * sign;
  const target = current * (1 + normalized * rate);
  return Math.max(min, Math.min(max, target));
};

export function useFovWheelZoom(
  ctx: CesiumContextType,
  enabled = true,
  options: FovWheelZoomOptions = {}
) {
  const { minFov, maxFov, fovChangeRate, onAfterFovChange, onFovChange } = {
    ...defaultFovWheelZoomOptions,
    ...options,
  };
  const min = minFov ?? DEFAULT_MIN_FOV;
  const max = maxFov ?? DEFAULT_MAX_FOV;
  const rate = fovChangeRate ?? DEFAULT_FOV_CHANGE_RATE;

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      blockWheelEvent(event);

      ctx.withCamera((camera) => {
        if (!(camera.frustum instanceof PerspectiveFrustum)) return;

        const currentFov = camera.frustum.fov || 1;
        const nextFov = computeNextFov(
          currentFov,
          event.deltaY,
          min,
          max,
          rate
        );
        const newFov = nextFov;

        if (Math.abs(newFov - currentFov) > 0.0001) {
          onFovChange && onFovChange(newFov, currentFov);
          camera.frustum.fov = newFov;
          ctx.requestRender();
          onAfterFovChange && onAfterFovChange();
        }
      });
    },
    [ctx, min, max, rate, onAfterFovChange, onFovChange]
  );

  // Temporary global wheel blocker while viewer is not yet available.
  // Prevents native Cesium zoom from triggering on reload handler attaches.
  const pendingBlockerAttachedRef = useRef(false);
  const pendingWheelBlocker = useCallback(
    (event: WheelEvent) => {
      if (!enabled) return;
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

  useBlockDefaultZoomBehaviour({
    enabled,
    enable: enableWheelZoom,
    disable: disableWheelZoom,
    pendingWheelBlocker,
    ref: pendingBlockerAttachedRef,
  });

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
