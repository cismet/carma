import { useEffect, useMemo, useRef } from "react";

import { type Viewer, type Scene } from "cesium";

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
    if (!viewerRef.current) {
      return;
    }

    const viewer = viewerRef.current;
    const cameraController = viewer.scene.screenSpaceCameraController;

    cameraController.enableRotate = true;
    cameraController.enableTilt = true;
    cameraController.enableTranslate = true;

    setWheelZoomEnabled(isObliqueMode);

    if (isObliqueMode) {
      debug && console.debug("entering Oblique Mode");
      enterObliqueMode(ctx, originalFovRef, fixedPitch, fixedHeight, () => {
        enableCameraForceOblique();
        requestRender();
      });
    } else {
      debug && console.debug("leaving Oblique Mode", originalFovRef.current);
      leaveObliqueMode(ctx, originalFovRef, () => {
        disableCameraForceOblique();
        requestRender();
      });
    }

    return () => {
      if (viewerPreUpdateHandlers.has(viewer)) {
        const handlerToRemove = viewerPreUpdateHandlers.get(viewer);
        viewer.scene.preUpdate.removeEventListener(handlerToRemove!);
        viewerPreUpdateHandlers.delete(viewer);
      }
      setWheelZoomEnabled(false);
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
