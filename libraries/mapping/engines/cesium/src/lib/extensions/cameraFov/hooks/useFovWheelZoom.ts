import { useCallback, useRef } from "react";
import { useBlockDefaultZoomBehaviour } from "./useBlockDefaultZoomBehaviour";
import { PerspectiveFrustum, type Scene } from "cesium";

import type { Radians, Ratio } from "@carma/units/types";
import { isClose } from "@carma/units/helpers";
import { normalizeOptions } from "@carma-commons/utils";

import { CtxEvent } from "../../../cesiumContextEventMap";
import { blockWheelEvent } from "../../../utils/blockWheelEvent";

import {
  DEFAULT_MAX_FOV,
  DEFAULT_MIN_FOV,
  DEFAULT_FOV_CHANGE_RATE,
  DEFAULT_MIN_FOV_CHANGE,
  computeNextFov,
} from "../../../utils/fov";
import { useCesiumContext } from "../../../hooks/useCesiumContext";
import { isValidScene } from "../../../utils/instanceGates";
import { sceneRequestRender } from "../../../utils/sceneRequestRender";

const viewerWheelHandlers = new WeakMap<Scene, (event: WheelEvent) => void>();

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
  const {
    minFov,
    maxFov,
    fovChangeRate,
    onAfterFovChange,
    onFovChange,
    minFovChange,
  } = normalizeOptions(options, defaultFovWheelZoomOptions);

  const { sceneRef, emit } = useCesiumContext();

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      blockWheelEvent(event);
      const scene = sceneRef.current;
      if (!isValidScene(scene)) return;

      if (!(scene.camera.frustum instanceof PerspectiveFrustum)) return;

      const currentFov = scene.camera.frustum.fov as Radians;
      const nextFov = computeNextFov(
        currentFov,
        event.deltaY,
        minFov,
        maxFov,
        fovChangeRate
      );
      if (!isClose(nextFov, currentFov, minFovChange)) {
        onFovChange?.(nextFov, currentFov);
        scene.camera.frustum.fov = nextFov;
        sceneRequestRender(scene);
        // Emit via enum-typed context event
        emit?.(CtxEvent.FovChange, nextFov);
        onAfterFovChange?.();
      }
    },
    [
      sceneRef,
      emit,
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
    const scene = sceneRef.current;
    if (!isValidScene(scene)) return applied;

    scene.screenSpaceCameraController.enableZoom = false;

    if (!viewerWheelHandlers.has(scene)) {
      scene.canvas.addEventListener("wheel", handleWheel, {
        passive: false,
        capture: true,
      });
      viewerWheelHandlers.set(scene, handleWheel);
    }
    applied = true;
    // Once applied, remove any pending global blocker
    if (applied && pendingBlockerAttachedRef.current) {
      window.removeEventListener("wheel", pendingWheelBlocker, {
        capture: true,
      } as AddEventListenerOptions);
      pendingBlockerAttachedRef.current = false;
    }
    return applied;
  }, [sceneRef, handleWheel, pendingWheelBlocker]);

  const disableWheelZoom = useCallback(() => {
    let applied = false;
    const scene = sceneRef.current;
    if (!isValidScene(scene)) return applied;

    if (viewerWheelHandlers.has(scene)) {
      const handlerToRemove = viewerWheelHandlers.get(scene);
      scene.canvas.removeEventListener(
        "wheel",
        handlerToRemove as (event: WheelEvent) => void,
        true
      );
      viewerWheelHandlers.delete(scene);
    }

    scene.screenSpaceCameraController.enableZoom = true;
    applied = true;
    return applied;
  }, [sceneRef]);

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
      const scene = sceneRef.current;
      if (!isValidScene(scene)) return flag;
      flag = viewerWheelHandlers.has(scene);
      return flag;
    })(),
    pending: (() => {
      // true while viewer isn't available yet

      return !isValidScene(sceneRef.current);
    })(),
  };
}

export default useFovWheelZoom;
