import { useEffect, useMemo, useRef } from "react";

import type { Viewer } from "cesium";

import { type Scene, CesiumMath } from "@carma/cesium";

import {
  useCesiumContext,
  useFovWheelZoom,
  useCesiumCameraForceOblique,
} from "@carma-mapping/engines/cesium";

import { useOblique } from "./useOblique";
import { enterObliqueMode, leaveObliqueMode } from "../utils/cameraUtils";

const viewerPreUpdateHandlers = new WeakMap<Viewer, (scene: Scene) => void>();

export function useObliqueInitializer(debug = false) {
  const ctx = useCesiumContext();
  const { viewerRef, shouldSuspendPitchLimiterRef, requestRender } = ctx;
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
      viewerRef,
      fixedPitch,
      fixedHeight,
      shouldSuspendPitchLimiterRef
    );

  useEffect(() => {
    // Always set the zoom handler state based on oblique mode; the hook will defer attaching until a viewer exists
    setWheelZoomEnabled(isObliqueMode);

    ctx.withCamera((camera, viewer) => {
      const cameraController = viewer.scene.screenSpaceCameraController;

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
      ctx.withViewer((viewer) => {
        if (viewerPreUpdateHandlers.has(viewer)) {
          const handlerToRemove = viewerPreUpdateHandlers.get(viewer);
          viewer.scene.preUpdate.removeEventListener(handlerToRemove!);
          viewerPreUpdateHandlers.delete(viewer);
        }
      });
    };
  }, [
    debug,
    isObliqueMode,
    ctx,
    viewerRef,
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
