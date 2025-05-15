import { useEffect, useMemo, useRef } from "react";

import { type Viewer, type Scene } from "cesium";

import {
  useCesiumContext,
  useFovWheelZoom,
  useCesiumCameraForceOblique,
} from "@carma-mapping/cesium-engine";

import { useOblique } from "./useOblique";
import { enterObliqueMode, leaveObliqueMode } from "../utils/cameraUtils";
import { useObliqueNearestImage } from "./useObliqueNearestImage";

const viewerPreUpdateHandlers = new WeakMap<Viewer, (scene: Scene) => void>();

export function useObliqueInitializer(debug = false) {
  const { viewerRef, viewerAnimationMapRef, shouldSuspendPitchLimiterRef } =
    useCesiumContext();
  const {
    isObliqueMode,
    fixedHeight,
    fixedPitch,
    minFov,
    maxFov,
    headingOffset,
  } = useOblique();
  const originalFovRef = useRef<number | null>(null);

  useObliqueNearestImage(debug);

  const wheelZoomOptions = useMemo(
    () => ({
      minFov,
      maxFov,
    }),
    [minFov, maxFov]
  );

  const { setEnabled: setWheelZoomEnabled } = useFovWheelZoom(
    viewerRef,
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
      enterObliqueMode(
        viewer,
        viewerAnimationMap,
        originalFovRef,
        fixedPitch,
        fixedHeight,
        () => {
          enableCameraForceOblique();
          viewer.scene.requestRender();
        }
      );
    } else {
      debug && console.debug("leaving Oblique Mode", originalFovRef.current);
      leaveObliqueMode(viewer, viewerAnimationMap, originalFovRef, () => {
        disableCameraForceOblique();
        viewer.scene.requestRender();
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
  ]);

  return {
    isObliqueMode,
  };
}

export default useObliqueInitializer;
