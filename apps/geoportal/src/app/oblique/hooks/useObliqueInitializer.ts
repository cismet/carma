import { useEffect, useMemo, useRef } from "react";

import { type Viewer, type Scene } from "cesium";

import {
  useCesiumContext,
  useFovWheelZoom,
  useCesiumCameraForceOblique,
} from "@carma-mapping/engines/cesium";

import { useOblique } from "./useOblique";
import {
  enterObliqueModeCtx,
  leaveObliqueModeCtx,
} from "../utils/cameraUtils";

const viewerPreUpdateHandlers = new WeakMap<Viewer, (scene: Scene) => void>();

export function useObliqueInitializer(debug = false) {
  const ctx = useCesiumContext();
  const { viewerRef, viewerAnimationMapRef, shouldSuspendPitchLimiterRef, requestRender } = ctx;
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
    const viewerAnimationMap = viewerAnimationMapRef.current;
    const cameraController = viewer.scene.screenSpaceCameraController;

    cameraController.enableRotate = true;
    cameraController.enableTilt = true;
    cameraController.enableTranslate = true;

    setWheelZoomEnabled(isObliqueMode);

    if (isObliqueMode) {
      debug && console.debug("entering Oblique Mode");
      enterObliqueModeCtx(ctx, viewerAnimationMap, originalFovRef, fixedPitch, fixedHeight, () => {
        enableCameraForceOblique();
        requestRender();
      });
    } else {
      debug && console.debug("leaving Oblique Mode", originalFovRef.current);
      leaveObliqueModeCtx(ctx, viewerAnimationMap, originalFovRef, () => {
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
    viewerRef,
    viewerAnimationMapRef,
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
