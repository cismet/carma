import { useCallback, useRef } from "react";
import { useBlockDefaultZoomBehaviour } from "./useBlockDefaultZoomBehaviour";
import { PerspectiveFrustum, type Viewer } from "cesium";

import type { Radians, Ratio } from "@carma/units/types";
import { normalizeOptions, isClose } from "@carma-commons/utils";

import { useCesiumContext } from "../hooks/useCesiumContext";
import { blockWheelEvent } from "../utils/blockWheelEvent";

import {
  DEFAULT_MAX_FOV,
  DEFAULT_MIN_FOV,
  DEFAULT_FOV_CHANGE_RATE,
  DEFAULT_MIN_FOV_CHANGE,
  computeNextFov,
} from "../utils/fov";

const viewerWheelHandlers = new WeakMap<Viewer, (event: WheelEvent) => void>();

export interface FovWheelZoomOptions {
  minFov?: Radians;
  maxFov?: Radians;
  fovChangeRate?: Ratio;
  onAfterFovChange?: () => void;
  onFovChange?: (newFov: Radians, previousFov: Radians) => void;
  minFovChange?: Radians; // minimum change in FOV to trigger an update (radians), default 0.0001
}

const defaultFovWheelZoomOptions: Required<FovWheelZoomOptions> = {
  minFov: DEFAULT_MIN_FOV,
  maxFov: DEFAULT_MAX_FOV,
  fovChangeRate: DEFAULT_FOV_CHANGE_RATE, // is pretty low but compounds fast
  minFovChange: DEFAULT_MIN_FOV_CHANGE,
  onAfterFovChange: () => {},
  onFovChange: () => {},
};

export function useFovWheelZoom(
  enabled = true,
  options: FovWheelZoomOptions = {}
) {
  const ctx = useCesiumContext();
  const {
    minFov,
    maxFov,
    fovChangeRate,
    onAfterFovChange,
    onFovChange,
    minFovChange,
  } = normalizeOptions(options, defaultFovWheelZoomOptions);

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      blockWheelEvent(event);

      ctx.withCamera((camera) => {
        if (!(camera.frustum instanceof PerspectiveFrustum)) return;

        const currentFov = camera.frustum.fov as Radians;
        const nextFov = computeNextFov(
          currentFov,
          event.deltaY as Radians,
          minFov,
          maxFov,
          fovChangeRate
        );
        if (!isClose(nextFov, currentFov, minFovChange)) {
          onFovChange?.(nextFov, currentFov);
          camera.frustum.fov = nextFov;
          ctx.requestRender();
          // Emit via enum-typed context event
          // todo fovmode schould be app/framwork logic
          // cesium context just provides fovzoom in fovzoom out methods
          // ctx.emit?.(CtxEvent.FovChange, nextFov);
          onAfterFovChange?.();
        }
      });
    },
    [
      ctx,
      minFov,
      maxFov,
      fovChangeRate,
      onAfterFovChange,
      onFovChange,
      minFovChange,
    ]
  );

  // Temporary global wheel blocker while viewer is not yet available.
  // Prevents native Cesium zoom from triggering on reload handler attaches.
  const pendingBlockerAttachedRef = useRef(false);
  const pendingWheelBlocker = useCallback(
    (event: WheelEvent) => {
      if (!enabled) return;
      blockWheelEvent(event);
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
        capture: true,
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
