import { useCallback, useEffect, useMemo, useRef } from "react";

import { type Scene } from "@carma/cesium";
import { handleDelayedRender } from "@carma-commons/utils";

import {
  useCesiumContext,
  useFovWheelZoom,
  useCesiumCameraForceOblique,
  testCameraObliqueCompliant,
} from "@carma-mapping/engines/cesium";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

import { useOblique } from "./useOblique";
import { enterObliqueMode, leaveObliqueMode } from "../utils/cameraUtils";

export function useObliqueInitializer(debug = false) {
  const {
    shouldSuspendPitchLimiterRef,
    getScene,
    sceneAnimationMapRef,
    initialViewApplied,
  } = useCesiumContext();
  const { isTransitioning } = useMapFrameworkSwitcherContext();
  const {
    isObliqueMode,
    fixedHeight,
    fixedPitch,
    minFov,
    maxFov,
    setSuspendSelectionSearch,
  } = useOblique();
  const originalFovRef = useRef<number | null>(null);

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

    if (!initialViewApplied) {
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
        const isCameraObliqueCompliant = testCameraObliqueCompliant(
          camera,
          obliqueOptions
        );

        if (isCameraObliqueCompliant) {
          debug && console.debug("skipping enter animation");
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

    return () => {
      disableCameraForceOblique();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debug,
    isObliqueMode,
    initialViewApplied,
    // ctx, // intentionally omitted to prevent re-triggering on context changes
    getScene,
    fixedPitch,
    fixedHeight,
    minFov,
    maxFov,
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
