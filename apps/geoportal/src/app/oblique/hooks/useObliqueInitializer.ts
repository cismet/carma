import { useCallback, useEffect, useMemo, useRef } from "react";

import { type Scene } from "@carma-cesium";
import { handleDelayedRender } from "@carma-commons/dom/window";
import {
  cancelSceneAnimation,
  testCameraObliqueCompliant,
} from "@carma-mapping/engines/cesium/core";
import {
  useCesiumCameraForceOblique,
  useCesiumFovWheelZoom,
} from "@carma-mapping/engines/cesium/react/interactions";

import { useCesiumContext } from "@carma-mapping/engines/cesium/react/runtime";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

import { useOblique } from "./useOblique";
import {
  enterObliqueMode,
  leaveObliqueMode as animateLeaveObliqueMode,
} from "../utils/cameraUtils";

const LEAVE_OBLIQUE_TRANSITION_TIMEOUT_MS = 3000;

export function useObliqueInitializer(debug = false) {
  const {
    shouldSuspendPitchLimiterRef,
    shouldSuspendCameraLimitersRef,
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
    targetEnterObliqueModeFov,
    animations,
    restoreFovOnLeave,
    setLockFootprint,
    setObliqueMode,
    setPreviewVisible,
    setSuspendSelectionSearch,
  } = useOblique();

  // Derived scene ref for useCesiumCameraForceOblique
  const sceneRef = useRef<Scene | null>(null);
  const lastHandledObliqueModeRef = useRef<boolean | null>(null);
  const leaveObliqueModeResolversRef = useRef(new Set<() => void>());
  const scene = getScene();
  sceneRef.current = scene;

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

  const { setEnabled: setWheelZoomEnabled } = useCesiumFovWheelZoom(
    scene,
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

  const setTransitionLimitersSuspended = useCallback(
    (isSuspended: boolean) => {
      shouldSuspendPitchLimiterRef.current = isSuspended;
      shouldSuspendCameraLimitersRef.current = isSuspended;
    },
    [shouldSuspendPitchLimiterRef, shouldSuspendCameraLimitersRef]
  );

  const resolveLeaveObliqueModeWaiters = useCallback(() => {
    const waiters = Array.from(leaveObliqueModeResolversRef.current);
    leaveObliqueModeResolversRef.current.clear();
    for (const resolve of waiters) {
      resolve();
    }
  }, []);

  const leaveObliqueMode = useCallback(() => {
    setPreviewVisible(false);

    if (!isObliqueMode) {
      return Promise.resolve();
    }

    const scene = getScene();
    if (!initialViewApplied || !scene) {
      setLockFootprint(false);
      setSuspendSelectionSearch(false);
      setTransitionLimitersSuspended(false);
      setObliqueMode(false);
      return Promise.resolve();
    }

    scene.camera.cancelFlight();
    cancelSceneAnimation(scene, sceneAnimationMapRef.current);

    return new Promise<void>((resolve) => {
      let timeoutId: number | undefined;
      const resolveOnce = () => {
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId);
        }
        leaveObliqueModeResolversRef.current.delete(resolveOnce);
        resolve();
      };

      timeoutId = window.setTimeout(
        resolveOnce,
        LEAVE_OBLIQUE_TRANSITION_TIMEOUT_MS
      );
      leaveObliqueModeResolversRef.current.add(resolveOnce);
      setLockFootprint(true);
      setSuspendSelectionSearch(true);
      setTransitionLimitersSuspended(true);
      setObliqueMode(false);
    });
  }, [
    getScene,
    initialViewApplied,
    isObliqueMode,
    sceneAnimationMapRef,
    setLockFootprint,
    setObliqueMode,
    setPreviewVisible,
    setSuspendSelectionSearch,
    setTransitionLimitersSuspended,
  ]);

  useEffect(() => {
    // Always set the zoom handler state based on oblique mode; the hook will defer attaching until a runtime exists
    setWheelZoomEnabled(isObliqueMode);

    if (!initialViewApplied) {
      return;
    }

    const scene = getScene();
    if (scene) {
      const lastHandledObliqueMode = lastHandledObliqueModeRef.current;
      const shouldLeaveObliqueMode =
        !isObliqueMode && lastHandledObliqueMode === true;
      lastHandledObliqueModeRef.current = isObliqueMode;

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
          setTransitionLimitersSuspended(true);
          enterObliqueMode(
            scene,
            fixedPitch,
            fixedHeight,
            minFov,
            maxFov,
            () => {
              setTransitionLimitersSuspended(false);
              setSuspendSelectionSearch(false);
              enableCameraForceOblique();
              requestRender({ delay: 50, repeat: 2 });
            },
            {
              duration: animations.enterObliqueMode?.duration,
              easingFunction: animations.enterObliqueMode?.easingFunction,
              targetEnterObliqueModeFov,
            }
          );
        }
      } else if (shouldLeaveObliqueMode) {
        debug && console.debug("leaving Oblique Mode");
        setTransitionLimitersSuspended(true);
        camera.cancelFlight();
        animateLeaveObliqueMode(
          scene,
          () => {
            setTransitionLimitersSuspended(false);
            setLockFootprint(false);
            setSuspendSelectionSearch(false);
            disableCameraForceOblique();
            requestRender();
            resolveLeaveObliqueModeWaiters();
          },
          restoreFovOnLeave
        );
      }
    }

    return () => {
      setTransitionLimitersSuspended(false);
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
    targetEnterObliqueModeFov,
    animations,
    restoreFovOnLeave,
    setWheelZoomEnabled,
    enableCameraForceOblique,
    disableCameraForceOblique,
    setTransitionLimitersSuspended,
    setLockFootprint,
    setSuspendSelectionSearch,
    resolveLeaveObliqueModeWaiters,
  ]);

  return {
    isObliqueMode,
    leaveObliqueMode,
  };
}

export default useObliqueInitializer;
