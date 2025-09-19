import { useEffect, useMemo, useRef } from "react";

import { type Scene, Math as CesiumMath } from "cesium";

import {
  useCesiumContext,
  useFovWheelZoom,
  useCesiumCameraForceOblique,
} from "@carma-mapping/engines/cesium";

import { useOblique } from "./useOblique";
import { enterObliqueMode, leaveObliqueMode } from "../utils/cameraUtils";

const preUpdateHandlers = new WeakMap<Scene, (scene: Scene) => void>();

export function useObliqueInitializer(debug = false) {
  const ctx = useCesiumContext();
  const { widgetRef, shouldSuspendPitchLimiterRef, requestRender } = ctx;
  const {
    isObliqueMode,
    fixedHeight,
    fixedPitch,
    minFov,
    maxFov,
    headingOffset,
  } = useOblique();
  const originalFovRef = useRef<number | null>(null);

  const wheelZoomOptions = useMemo(
    () => ({
      minFov,
      maxFov,
    }),
    [minFov, maxFov]
  );

  const { setEnabled: setWheelZoomEnabled } = useFovWheelZoom(
    ctx,
    isObliqueMode,
    wheelZoomOptions
  );

  const { enableCameraForceOblique, disableCameraForceOblique } =
    useCesiumCameraForceOblique(
      widgetRef,
      fixedPitch,
      fixedHeight,
      shouldSuspendPitchLimiterRef
    );

  useEffect(() => {
    // Always set the zoom handler state based on oblique mode; the hook will defer attaching until a instance exists
    setWheelZoomEnabled(isObliqueMode);

    ctx.withSceneCamera((scene) => {
      const cameraController = scene.screenSpaceCameraController;

      cameraController.enableRotate = true;
      cameraController.enableTilt = true;
      cameraController.enableTranslate = true;

      if (isObliqueMode) {
        debug && console.debug("entering Oblique Mode");
        // If camera already has an oblique-like pitch (e.g., restored from hash), don't override it
        let isAlreadyOblique = false;
        ctx.withCamera((camera) => {
          const p = camera.pitch;
          const minOblique = -CesiumMath.toRadians(80);
          const maxOblique = -CesiumMath.toRadians(5);
          isAlreadyOblique = p > minOblique && p < maxOblique;
        });

        if (isAlreadyOblique) {
          enableCameraForceOblique();
          requestRender({ delay: 50, repeat: 2 });
        } else {
          enterObliqueMode(ctx, originalFovRef, fixedPitch, fixedHeight, () => {
            enableCameraForceOblique();
            requestRender({ delay: 50, repeat: 2 });
          });
        }
      } else {
        debug && console.debug("leaving Oblique Mode", originalFovRef.current);
        leaveObliqueMode(ctx, originalFovRef, () => {
          disableCameraForceOblique();
          requestRender();
        });
      }
    });

    return () => {
      ctx.withScene((scene) => {
        if (preUpdateHandlers.has(scene)) {
          const handlerToRemove = preUpdateHandlers.get(scene);
          scene.preUpdate.removeEventListener(handlerToRemove!);
          preUpdateHandlers.delete(scene);
        }
      });
    };
  }, [
    debug,
    isObliqueMode,
    ctx,
    widgetRef,
    fixedPitch,
    fixedHeight,
    minFov,
    maxFov,
    headingOffset,
    setWheelZoomEnabled,
    enableCameraForceOblique,
    disableCameraForceOblique,
    requestRender,
  ]);

  return {
    isObliqueMode,
  };
}

export default useObliqueInitializer;
