import { useCallback, useEffect, useMemo, useRef } from "react";

import { type Scene } from "@carma/cesium";

import {
  useCesiumContext,
  useFovWheelZoom,
  useCesiumCameraForceOblique,
  isCameraObliqueCompliant,
} from "@carma-mapping/engines/cesium";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

import { useOblique } from "./useOblique";
import { enterObliqueMode, leaveObliqueMode } from "../utils/cameraUtils";
import { handleDelayedRender } from "@carma-commons/utils";

export function useObliqueInitializer(debug = false) {
  const {
    shouldSuspendPitchLimiterRef,
    getScene,
    sceneAnimationMapRef,
    isViewerReady,
    initialViewApplied,
  } = useCesiumContext();
  const { isTransitioning } = useMapFrameworkSwitcherContext();
  const {
    isObliqueMode,
    fixedHeight,
    fixedPitch,
    minFov,
    maxFov,
    headingOffset,
    setSuspendSelectionSearch,
  } = useOblique();
  const originalFovRef = useRef<number | null>(null);
  const isFirstRunRef = useRef(true);

  // Derived scene ref for useCesiumCameraForceOblique
  const sceneRef = useRef<Scene | null>(null);
  sceneRef.current = getScene();

  const checkExternalAnimations = useCallback(
    (scene: Scene) => {
      return (
        (sceneAnimationMapRef?.current?.has(scene) ?? false) || isTransitioning
      );
    },
    [sceneAnimationMapRef, isTransitioning]
  );

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

  const obliqueOptions = useMemo(
    () => ({ fixedPitch, fixedHeight }),
    [fixedPitch, fixedHeight]
  );

  const { enableCameraForceOblique, disableCameraForceOblique } =
    useCesiumCameraForceOblique(
      sceneRef,
      obliqueOptions,
      shouldSuspendPitchLimiterRef,
      checkExternalAnimations
    );

  useEffect(() => {
    // Always set the zoom handler state based on oblique mode; the hook will defer attaching until a viewer exists
    setWheelZoomEnabled(isObliqueMode);

    // Wait for viewer ready and initial camera from URL applied
    if (!isViewerReady || !initialViewApplied) {
      return;
    }

    const scene = getScene();
    if (scene) {
      const requestRender = (opts?: { delay?: number; repeat?: number }) =>
        handleDelayedRender(() => scene.requestRender(), opts);

      const cameraController = scene.screenSpaceCameraController;
      const camera = scene.camera;

      cameraController.enableRotate = true;
      cameraController.enableTilt = true;
      cameraController.enableTranslate = true;

      if (isObliqueMode) {
        debug && console.debug("entering Oblique Mode");
        // If oblique mode was enabled from URL on first run, assume camera is already correct
        const obliqueFromUrl = isFirstRunRef.current;
        // Also check camera position for user-initiated oblique mode
        const isAlreadyOblique =
          obliqueFromUrl || isCameraObliqueCompliant(camera, obliqueOptions);

        if (isAlreadyOblique) {
          debug &&
            console.debug("skipping enter animation", { obliqueFromUrl });
          enableCameraForceOblique();
          requestRender({ delay: 50, repeat: 2 });
        } else {
          setSuspendSelectionSearch(true);
          enterObliqueMode(
            scene,
            originalFovRef,
            fixedPitch,
            fixedHeight,
            () => {
              setSuspendSelectionSearch(false);
              enableCameraForceOblique();
              requestRender({ delay: 50, repeat: 2 });
            }
          );
        }
      } else {
        debug && console.debug("leaving Oblique Mode", originalFovRef.current);
        leaveObliqueMode(scene, originalFovRef, () => {
          disableCameraForceOblique();
          requestRender();
        });
      }
    }

    isFirstRunRef.current = false;

    return () => {
      disableCameraForceOblique();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debug,
    isObliqueMode,
    isViewerReady,
    initialViewApplied,
    // ctx, // intentionally omitted to prevent re-triggering on context changes
    getScene,
    fixedPitch,
    fixedHeight,
    minFov,
    maxFov,
    headingOffset,
    setWheelZoomEnabled,
    enableCameraForceOblique,
    disableCameraForceOblique,
    setSuspendSelectionSearch,
  ]);

  return {
    isObliqueMode,
  };
}

export default useObliqueInitializer;
