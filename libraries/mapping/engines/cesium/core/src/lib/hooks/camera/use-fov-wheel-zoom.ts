import { useCallback, useRef } from "react";
import { useBlockDefaultZoomBehaviour } from "./use-block-default-zoom-behaviour";
import { type Scene, isValidScene, isPerspectiveFrustum } from "@carma/cesium";

import type { Radians, Ratio } from "@carma/units/types";
import { isClose } from "@carma/units/helpers";
import { normalizeOptions, blockWheelEvent } from "@carma-commons/utils";

// Event system removed - using direct callbacks instead

import {
  DEFAULT_MAX_FOV,
  DEFAULT_MIN_FOV,
  DEFAULT_FOV_CHANGE_RATE,
  DEFAULT_MIN_FOV_CHANGE,
  computeNextFov,
} from "../../scene/camera/fov";
import { useCesiumContext } from "../../context/hooks/use-cesium-context";

import { sceneRequestRender } from "../../scene/scene-request-render";

const sceneWheelHandlers = new WeakMap<Scene, (event: WheelEvent) => void>();

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

  const { sceneRef } = useCesiumContext();

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      blockWheelEvent(event);
      const scene = sceneRef.current;
      if (!isValidScene(scene) || !scene) return;

      // Use sync validator - will fall back to property check if not initialized yet
      if (!isPerspectiveFrustum(scene.camera.frustum)) return;

      const frustum = scene.camera.frustum as { fov: number };
      const currentFov = frustum.fov as Radians;
      const nextFov = computeNextFov(
        currentFov,
        event.deltaY,
        minFov,
        maxFov,
        fovChangeRate
      );
      if (!isClose(nextFov, currentFov, minFovChange)) {
        onFovChange?.(nextFov, currentFov);
        frustum.fov = nextFov;
        sceneRequestRender(scene);
        // Direct callback instead of event emission
        // FOV change is handled by the onFovChange callback
        onAfterFovChange?.();
      }
    },
    [
      sceneRef,
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
    if (!isValidScene(scene) || !scene) return applied;

    scene.screenSpaceCameraController.enableZoom = false;

    if (!sceneWheelHandlers.has(scene)) {
      scene.canvas.addEventListener("wheel", handleWheel, {
        passive: false,
        capture: true,
      });
      sceneWheelHandlers.set(scene, handleWheel);
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
    if (!isValidScene(scene) || !scene) return applied;

    if (sceneWheelHandlers.has(scene)) {
      const handlerToRemove = sceneWheelHandlers.get(scene);
      scene.canvas.removeEventListener(
        "wheel",
        handlerToRemove as (event: WheelEvent) => void,
        true
      );
      sceneWheelHandlers.delete(scene);
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
      if (!isValidScene(scene) || !scene) return flag;
      flag = sceneWheelHandlers.has(scene);
      return flag;
    })(),
    pending: (() => {
      // true while viewer isn't available yet

      return !isValidScene(sceneRef.current);
    })(),
  };
}

export default useFovWheelZoom;
