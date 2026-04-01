import { useCallback, useEffect, useRef } from "react";

import { CesiumMath, PerspectiveFrustum, type Scene } from "@carma-cesium";
import type { Radians } from "@carma-units";
import {
  cancelCesiumSceneDollyZoom,
  cancelCesiumSceneTravelZoom,
  computeNextCesiumFov,
  flyCesiumSceneFovZoom,
  readPerspectiveFrustumVerticalFov,
} from "@carma-mapping/engines/cesium/core";
import { normalizeOptions, isClose } from "@carma-commons/utils";

const sceneWheelHandlers = new WeakMap<Scene, (event: WheelEvent) => void>();
const sceneWheelTargetFovs = new WeakMap<Scene, Radians>();

const DEFAULT_MIN_FOV = CesiumMath.toRadians(10) as Radians;
const DEFAULT_MAX_FOV = CesiumMath.toRadians(120) as Radians;
const DEFAULT_WHEEL_ZOOM_DELTA = 0.08;
const INTERNAL_MIN_FOV_CHANGE = 0.0001 as Radians;
const DEFAULT_WHEEL_FOV_ANIMATION_DURATION_MS = 500;
const DEFAULT_PIXEL_WHEEL_DELTA_PER_STEP = 100;
const DEFAULT_LINE_WHEEL_DELTA_PER_STEP = 3;

const blockWheelEvent = (event: WheelEvent): void => {
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") {
    event.stopImmediatePropagation();
  }
};

const clearSceneWheelTargetFov = (
  scene: Scene,
  targetFov?: Radians | null
): void => {
  if (typeof targetFov === "number") {
    const pendingTargetFov = sceneWheelTargetFovs.get(scene);
    if (pendingTargetFov === targetFov) {
      sceneWheelTargetFovs.delete(scene);
    }
    return;
  }

  sceneWheelTargetFovs.delete(scene);
};

const readWheelZoomDelta = (
  event: Pick<WheelEvent, "deltaMode" | "deltaY">,
  zoomDelta: number
): number => {
  const absoluteDeltaY = Math.abs(event.deltaY);
  if (!Number.isFinite(absoluteDeltaY) || absoluteDeltaY <= 0) {
    return 0;
  }

  const normalizedStepMagnitude =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? absoluteDeltaY / DEFAULT_LINE_WHEEL_DELTA_PER_STEP
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? absoluteDeltaY
      : absoluteDeltaY / DEFAULT_PIXEL_WHEEL_DELTA_PER_STEP;

  return normalizedStepMagnitude * zoomDelta;
};

export interface CesiumFovWheelZoomOptions {
  minFov?: Radians;
  maxFov?: Radians;
  zoomDelta?: number;
}

type UseCesiumFovWheelZoomRuntimeOptions = {
  attachSceneWheelHandler?: boolean;
};

const defaultFovWheelZoomOptions: Required<CesiumFovWheelZoomOptions> = {
  minFov: DEFAULT_MIN_FOV,
  maxFov: DEFAULT_MAX_FOV,
  zoomDelta: DEFAULT_WHEEL_ZOOM_DELTA,
};

export function useCesiumFovWheelZoom(
  scene: Scene | null,
  enabled = true,
  options: CesiumFovWheelZoomOptions = {},
  { attachSceneWheelHandler = true }: UseCesiumFovWheelZoomRuntimeOptions = {}
) {
  const { minFov, maxFov, zoomDelta } = normalizeOptions(
    options,
    defaultFovWheelZoomOptions
  );

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      blockWheelEvent(event);

      if (!scene || scene.isDestroyed()) {
        return;
      }

      if (!(scene.camera.frustum instanceof PerspectiveFrustum)) {
        return;
      }

      const currentFov = readPerspectiveFrustumVerticalFov(
        scene.camera.frustum
      );
      if (typeof currentFov !== "number" || !Number.isFinite(currentFov)) {
        return;
      }

      const baseFov =
        sceneWheelTargetFovs.get(scene) ?? (currentFov as Radians);

      const direction = event.deltaY > 0 ? "out" : "in";
      const resolvedZoomDelta = readWheelZoomDelta(event, zoomDelta);

      const nextFov = computeNextCesiumFov(scene, direction, {
        zoomDelta: resolvedZoomDelta,
        minimumFovRad: minFov,
        maximumFovRad: maxFov,
        currentVerticalFovRadOverride: baseFov,
      });

      if (
        typeof nextFov !== "number" ||
        !Number.isFinite(nextFov) ||
        isClose(nextFov, baseFov, INTERNAL_MIN_FOV_CHANGE)
      ) {
        return;
      }

      cancelCesiumSceneDollyZoom(scene);
      cancelCesiumSceneTravelZoom(scene);

      sceneWheelTargetFovs.set(scene, nextFov);
      flyCesiumSceneFovZoom(scene, {
        direction,
        durationMs: DEFAULT_WHEEL_FOV_ANIMATION_DURATION_MS,
        zoomDelta: resolvedZoomDelta,
        minimumFovRad: minFov,
        maximumFovRad: maxFov,
        currentVerticalFovRadOverride: baseFov,
        onCompleted: () => {
          clearSceneWheelTargetFov(scene, nextFov);
        },
        onCanceled: () => {
          clearSceneWheelTargetFov(scene, nextFov);
        },
      });
    },
    [maxFov, minFov, scene, zoomDelta]
  );

  const pendingBlockerAttachedRef = useRef(false);
  const pendingWheelBlocker = useCallback(
    (event: WheelEvent) => {
      if (!enabled) {
        return;
      }
      blockWheelEvent(event);
    },
    [enabled]
  );

  const enableWheelZoom = useCallback(() => {
    if (!scene || scene.isDestroyed()) {
      return false;
    }

    scene.screenSpaceCameraController.enableZoom = false;
    if (!sceneWheelHandlers.has(scene)) {
      scene.canvas.addEventListener("wheel", handleWheel, {
        passive: false,
        capture: true,
      });
      sceneWheelHandlers.set(scene, handleWheel);
    }

    if (pendingBlockerAttachedRef.current) {
      window.removeEventListener("wheel", pendingWheelBlocker, {
        capture: true,
      } as AddEventListenerOptions);
      pendingBlockerAttachedRef.current = false;
    }

    return true;
  }, [handleWheel, pendingWheelBlocker, scene]);

  const disableWheelZoom = useCallback(() => {
    if (!scene || scene.isDestroyed()) {
      return false;
    }

    clearSceneWheelTargetFov(scene);

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
    return true;
  }, [scene]);

  useEffect(() => {
    let cancelled = false;

    if (!attachSceneWheelHandler) {
      return () => {
        cancelled = true;
        if (pendingBlockerAttachedRef.current) {
          window.removeEventListener("wheel", pendingWheelBlocker, {
            capture: true,
          } as AddEventListenerOptions);
          pendingBlockerAttachedRef.current = false;
        }
      };
    }

    const tryApply = (attemptsLeft: number) => {
      if (cancelled) {
        return;
      }

      const ok = enabled ? enableWheelZoom() : disableWheelZoom();
      if (!ok && attemptsLeft > 0) {
        requestAnimationFrame(() => tryApply(attemptsLeft - 1));
        if (enabled && !pendingBlockerAttachedRef.current) {
          window.addEventListener("wheel", pendingWheelBlocker, {
            passive: false,
            capture: true,
          });
          pendingBlockerAttachedRef.current = true;
        }
      }
    };

    tryApply(3);

    return () => {
      cancelled = true;
      disableWheelZoom();
      if (pendingBlockerAttachedRef.current) {
        window.removeEventListener("wheel", pendingWheelBlocker, {
          capture: true,
        } as AddEventListenerOptions);
        pendingBlockerAttachedRef.current = false;
      }
    };
  }, [
    attachSceneWheelHandler,
    disableWheelZoom,
    enableWheelZoom,
    enabled,
    pendingWheelBlocker,
  ]);

  const setEnabled = useCallback(
    (isEnabled: boolean) => {
      if (!attachSceneWheelHandler) {
        return;
      }

      if (isEnabled) {
        enableWheelZoom();
      } else {
        disableWheelZoom();
      }
    },
    [attachSceneWheelHandler, disableWheelZoom, enableWheelZoom]
  );

  return {
    handleWheel,
    setEnabled,
    isEnabled:
      attachSceneWheelHandler && scene !== null
        ? sceneWheelHandlers.has(scene)
        : false,
    pending: attachSceneWheelHandler ? scene === null : false,
  };
}

export default useCesiumFovWheelZoom;
