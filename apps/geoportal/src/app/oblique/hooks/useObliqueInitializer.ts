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
  const {
    viewerRef,
    shouldSuspendPitchLimiterRef,
    requestRender,
    withScene,
    withViewer,
  } = ctx;
  const {
    isObliqueMode,
    fixedHeight,
    fixedPitch,
    minFov,
    maxFov,
    headingOffset,
  } = useOblique();
  const originalFovRef = useRef<number | null>(null);
  const isFirstRunRef = useRef(true);

  const wheelZoomOptions = useMemo(
    () => ({
      minFov,
      maxFov,
    }),
    [minFov, maxFov]
  );

  const { setEnabled: setWheelZoomEnabled } = useFovWheelZoom(
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

    withScene((scene) => {
      const cameraController = scene.screenSpaceCameraController;
      const camera = scene.camera;

      cameraController.enableRotate = true;
      cameraController.enableTilt = true;
      cameraController.enableTranslate = true;

      if (isObliqueMode) {
        debug && console.debug("entering Oblique Mode");
        // If camera already has an oblique-like pitch (e.g., restored from hash), don't override it
        let isAlreadyOblique = false;

        const p = camera.pitch;
        const minOblique = -CesiumMath.toRadians(80);
        const maxOblique = -CesiumMath.toRadians(5);
        isAlreadyOblique = p > minOblique && p < maxOblique;

        if (isAlreadyOblique) {
          enableCameraForceOblique();
          requestRender({ delay: 50, repeat: 2 });
        } else {
          const duration = isFirstRunRef.current ? 0 : undefined;
          enterObliqueMode(
            scene,
            originalFovRef,
            fixedPitch,
            fixedHeight,
            () => {
              enableCameraForceOblique();
              requestRender({ delay: 50, repeat: 2 });
            },
            duration
          );
        }
      } else {
        debug && console.debug("leaving Oblique Mode", originalFovRef.current);
        leaveObliqueMode(scene, originalFovRef, () => {
          disableCameraForceOblique();
          requestRender();
        });
      }
    });

    isFirstRunRef.current = false;

    return () => {
      withViewer((viewer) => {
        if (viewerPreUpdateHandlers.has(viewer)) {
          const handlerToRemove = viewerPreUpdateHandlers.get(viewer);
          viewer.scene.preUpdate.removeEventListener(handlerToRemove!);
          viewerPreUpdateHandlers.delete(viewer);
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debug,
    isObliqueMode,
    // ctx, // intentionally omitted to prevent re-triggering on context changes
    withScene,
    withViewer,
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
