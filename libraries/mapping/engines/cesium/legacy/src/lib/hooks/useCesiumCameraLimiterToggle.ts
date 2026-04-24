import { useCallback, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";

import { fromCarmaViewPitchDegToCesiumPitchRad } from "@carma-commons/camera/model";
import { Cartesian3, type Scene } from "@carma-cesium";

import {
  selectScreenSpaceCameraControllerEnableCollisionDetection,
  selectScreenSpaceCameraControllerMaximumZoomDistance,
  selectScreenSpaceCameraControllerMinimumZoomDistance,
} from "../slices/cesium";
import { useCesiumContext } from "./useCesiumContext";

export interface CesiumCameraLimiterReenableOptions {
  pitch: {
    durationSeconds: number;
  };
  travelZoom: {
    durationMilliseconds: number;
    easing: (progress: number) => number;
    minViewAxisVerticalRatio?: number;
  };
}

export interface UseCesiumCameraLimiterToggleOptions {
  maxPitchDegrees?: number;
  reenableOptions: CesiumCameraLimiterReenableOptions;
}

const DEFAULT_MAX_PITCH_DEGREES = 75;
const DEFAULT_CAMERA_LIMITER_REENABLE_MIN_VIEW_AXIS_VERTICAL_RATIO = 0.15;

const getLimiterTargetPitch = (maxPitchDegrees: number) =>
  fromCarmaViewPitchDegToCesiumPitchRad(maxPitchDegrees) ?? (0 as number);

export const useCesiumCameraLimiterToggle = ({
  maxPitchDegrees = DEFAULT_MAX_PITCH_DEGREES,
  reenableOptions,
}: UseCesiumCameraLimiterToggleOptions) => {
  const {
    shouldSuspendCameraLimitersRef,
    shouldSuspendPitchLimiterRef,
    withScene,
  } = useCesiumContext();
  const [areCameraLimitersDisabled, setAreCameraLimitersDisabled] =
    useState(false);
  const cameraCollisionDetection = useSelector(
    selectScreenSpaceCameraControllerEnableCollisionDetection
  );
  const cameraMinimumZoomDistance = useSelector(
    selectScreenSpaceCameraControllerMinimumZoomDistance
  );
  const cameraMaximumZoomDistance = useSelector(
    selectScreenSpaceCameraControllerMaximumZoomDistance
  );
  const cameraControllerLimitersRef = useRef({
    enableCollisionDetection: cameraCollisionDetection,
    maximumZoomDistance: cameraMaximumZoomDistance,
    minimumZoomDistance: cameraMinimumZoomDistance,
  });
  const cameraLimiterTransitionRef = useRef(0);
  const cameraLimiterRestoreFrameRef = useRef<number | null>(null);
  const cameraLimiterTravelZoomFrameRef = useRef<number | null>(null);
  const cameraLimiterTravelZoomCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    cameraControllerLimitersRef.current = {
      enableCollisionDetection: cameraCollisionDetection,
      maximumZoomDistance: cameraMaximumZoomDistance,
      minimumZoomDistance: cameraMinimumZoomDistance,
    };
  }, [
    cameraCollisionDetection,
    cameraMaximumZoomDistance,
    cameraMinimumZoomDistance,
  ]);

  const applySceneSpaceCameraControllerLimiters = useCallback(
    (disabled: boolean) => {
      withScene((scene) => {
        const controller = scene.screenSpaceCameraController;
        const cameraControllerLimiters = cameraControllerLimitersRef.current;

        controller.enableCollisionDetection = disabled
          ? false
          : cameraControllerLimiters.enableCollisionDetection;
        controller.minimumZoomDistance = disabled
          ? 1
          : cameraControllerLimiters.minimumZoomDistance;
        controller.maximumZoomDistance = disabled
          ? Infinity
          : cameraControllerLimiters.maximumZoomDistance;
      });
    },
    [withScene]
  );

  const cancelCameraLimiterTravelZoom = useCallback(() => {
    if (cameraLimiterTravelZoomFrameRef.current !== null) {
      cancelAnimationFrame(cameraLimiterTravelZoomFrameRef.current);
      cameraLimiterTravelZoomFrameRef.current = null;
    }

    cameraLimiterTravelZoomCleanupRef.current?.();
    cameraLimiterTravelZoomCleanupRef.current = null;
  }, []);

  const cancelDeferredCameraLimiterRestore = useCallback(() => {
    if (cameraLimiterRestoreFrameRef.current === null) {
      return;
    }

    cancelAnimationFrame(cameraLimiterRestoreFrameRef.current);
    cameraLimiterRestoreFrameRef.current = null;
  }, []);

  const startCameraLimiterTravelZoomToValidHeight = useCallback(
    (
      scene: Scene,
      {
        onCancel,
        onComplete,
      }: {
        onCancel: () => void;
        onComplete: () => void;
      }
    ): boolean => {
      const { travelZoom } = reenableOptions;
      const camera = scene.camera;
      const position = camera.positionCartographic;
      if (!position) {
        return false;
      }

      const minimumZoomDistance = Number.isFinite(
        cameraControllerLimitersRef.current.minimumZoomDistance
      )
        ? cameraControllerLimitersRef.current.minimumZoomDistance
        : 1;
      const readMinimumHeight = () =>
        (scene.globe?.getHeight(camera.positionCartographic) ?? 0) +
        minimumZoomDistance;
      const moveCameraToValidHeight = () => {
        const heightDeficit =
          readMinimumHeight() - camera.positionCartographic.height;
        if (heightDeficit <= 0) {
          return;
        }

        const currentVerticalRatio = Math.max(
          Math.sin(Math.abs(camera.pitch)),
          travelZoom.minViewAxisVerticalRatio ??
            DEFAULT_CAMERA_LIMITER_REENABLE_MIN_VIEW_AXIS_VERTICAL_RATIO
        );
        camera.moveBackward(heightDeficit / currentVerticalRatio);
      };

      const minimumHeight = readMinimumHeight();
      const heightDeficit = minimumHeight - position.height;
      if (heightDeficit <= 0) {
        return false;
      }

      cancelCameraLimiterTravelZoom();

      const startedAtMs = performance.now();
      const verticalRatio = Math.max(
        Math.sin(Math.abs(camera.pitch)),
        travelZoom.minViewAxisVerticalRatio ??
          DEFAULT_CAMERA_LIMITER_REENABLE_MIN_VIEW_AXIS_VERTICAL_RATIO
      );
      const targetTravelDistance = (heightDeficit / verticalRatio) * 1.25;
      let previousEased = 0;

      const cancelForUserInput = () => {
        cancelCameraLimiterTravelZoom();
        onCancel();
      };
      const addInputListener = (
        target: EventTarget,
        type: string,
        options?: AddEventListenerOptions
      ) => target.addEventListener(type, cancelForUserInput, options);
      const removeInputListener = (
        target: EventTarget,
        type: string,
        options?: EventListenerOptions
      ) => target.removeEventListener(type, cancelForUserInput, options);
      const passiveCaptureOptions = { capture: true, passive: true };

      addInputListener(scene.canvas, "pointerdown", passiveCaptureOptions);
      addInputListener(scene.canvas, "wheel", passiveCaptureOptions);
      addInputListener(window, "keydown", { capture: true });
      cameraLimiterTravelZoomCleanupRef.current = () => {
        removeInputListener(scene.canvas, "pointerdown", passiveCaptureOptions);
        removeInputListener(scene.canvas, "wheel", passiveCaptureOptions);
        removeInputListener(window, "keydown", { capture: true });
      };

      const finish = () => {
        cameraLimiterTravelZoomFrameRef.current = null;
        cameraLimiterTravelZoomCleanupRef.current?.();
        cameraLimiterTravelZoomCleanupRef.current = null;
        moveCameraToValidHeight();
        scene.requestRender();
        onComplete();
      };

      const step = (nowMs: number) => {
        const progress = Math.min(
          1,
          (nowMs - startedAtMs) / travelZoom.durationMilliseconds
        );
        const eased = travelZoom.easing(progress);
        const travelStep = targetTravelDistance * (eased - previousEased);

        if (travelStep > 0) {
          camera.moveBackward(travelStep);
        }
        previousEased = eased;

        const isHeightValid =
          camera.positionCartographic.height >= readMinimumHeight();
        if (isHeightValid || progress >= 1) {
          finish();
          return;
        }

        scene.requestRender();
        cameraLimiterTravelZoomFrameRef.current = requestAnimationFrame(step);
      };

      cameraLimiterTravelZoomFrameRef.current = requestAnimationFrame(step);
      return true;
    },
    [cancelCameraLimiterTravelZoom, reenableOptions]
  );

  const transitionCameraIntoLimiterRange = useCallback(
    ({
      onCancel,
      onComplete,
    }: {
      onCancel: () => void;
      onComplete: () => void;
    }) => {
      let didStartTransition = false;

      withScene((scene) => {
        const { pitch } = reenableOptions;
        const camera = scene.camera;
        const position = camera.positionCartographic;
        if (!camera || !position) {
          return;
        }

        const targetPitch = getLimiterTargetPitch(maxPitchDegrees);
        const currentPitch = camera.pitch;
        const constrainedPitch =
          currentPitch > targetPitch ? targetPitch : currentPitch;

        const needsPitchCorrection = constrainedPitch !== currentPitch;
        const cancelTransition = () => {
          cancelCameraLimiterTravelZoom();
          onCancel();
        };
        const completeWithTravelZoom = () => {
          if (
            !startCameraLimiterTravelZoomToValidHeight(scene, {
              onCancel: cancelTransition,
              onComplete,
            })
          ) {
            onComplete();
          }
        };

        if (!needsPitchCorrection) {
          didStartTransition = startCameraLimiterTravelZoomToValidHeight(
            scene,
            {
              onCancel: cancelTransition,
              onComplete,
            }
          );
          return;
        }

        didStartTransition = true;
        camera.cancelFlight();
        camera.flyTo({
          destination: Cartesian3.clone(camera.position),
          orientation: {
            heading: camera.heading,
            pitch: constrainedPitch,
            roll: camera.roll,
          },
          duration: pitch.durationSeconds,
          complete: completeWithTravelZoom,
          cancel: cancelTransition,
        });
      });

      if (!didStartTransition) {
        onComplete();
      }
    },
    [
      cancelCameraLimiterTravelZoom,
      maxPitchDegrees,
      reenableOptions,
      startCameraLimiterTravelZoomToValidHeight,
      withScene,
    ]
  );

  const keepCameraLimitersDisabled = useCallback(
    (updateState: boolean) => {
      cancelCameraLimiterTravelZoom();
      cancelDeferredCameraLimiterRestore();
      shouldSuspendCameraLimitersRef.current = true;
      shouldSuspendPitchLimiterRef.current = true;
      applySceneSpaceCameraControllerLimiters(true);
      if (updateState) {
        setAreCameraLimitersDisabled(true);
      }
    },
    [
      applySceneSpaceCameraControllerLimiters,
      cancelCameraLimiterTravelZoom,
      cancelDeferredCameraLimiterRestore,
      shouldSuspendCameraLimitersRef,
      shouldSuspendPitchLimiterRef,
    ]
  );

  const reenableCameraLimiters = useCallback(
    ({
      restoreOnCancel,
      updateState,
    }: {
      restoreOnCancel: boolean;
      updateState: boolean;
    }) => {
      const transitionId = cameraLimiterTransitionRef.current + 1;
      cameraLimiterTransitionRef.current = transitionId;

      cancelDeferredCameraLimiterRestore();
      cancelCameraLimiterTravelZoom();
      shouldSuspendCameraLimitersRef.current = true;
      shouldSuspendPitchLimiterRef.current = true;
      applySceneSpaceCameraControllerLimiters(true);
      if (updateState) {
        setAreCameraLimitersDisabled(false);
      }

      const restoreLimiters = () => {
        if (cameraLimiterTransitionRef.current !== transitionId) {
          return;
        }

        cancelDeferredCameraLimiterRestore();
        cameraLimiterRestoreFrameRef.current = requestAnimationFrame(() => {
          cameraLimiterRestoreFrameRef.current = null;

          if (cameraLimiterTransitionRef.current !== transitionId) {
            return;
          }

          shouldSuspendCameraLimitersRef.current = false;
          shouldSuspendPitchLimiterRef.current = false;
          applySceneSpaceCameraControllerLimiters(false);
        });
      };

      transitionCameraIntoLimiterRange({
        onCancel: restoreOnCancel
          ? restoreLimiters
          : () => keepCameraLimitersDisabled(updateState),
        onComplete: restoreLimiters,
      });
    },
    [
      applySceneSpaceCameraControllerLimiters,
      cancelCameraLimiterTravelZoom,
      cancelDeferredCameraLimiterRestore,
      keepCameraLimitersDisabled,
      shouldSuspendCameraLimitersRef,
      shouldSuspendPitchLimiterRef,
      transitionCameraIntoLimiterRange,
    ]
  );

  const setCameraLimitersDisabled = useCallback(
    (disabled: boolean) => {
      cameraLimiterTransitionRef.current += 1;
      shouldSuspendCameraLimitersRef.current = disabled;
      shouldSuspendPitchLimiterRef.current = disabled;
      setAreCameraLimitersDisabled(disabled);
      cancelDeferredCameraLimiterRestore();

      if (disabled) {
        cancelCameraLimiterTravelZoom();
        withScene((scene) => scene.camera.cancelFlight());
        applySceneSpaceCameraControllerLimiters(true);
        return;
      }

      reenableCameraLimiters({
        restoreOnCancel: false,
        updateState: true,
      });
    },
    [
      applySceneSpaceCameraControllerLimiters,
      cancelCameraLimiterTravelZoom,
      cancelDeferredCameraLimiterRestore,
      reenableCameraLimiters,
      shouldSuspendCameraLimitersRef,
      shouldSuspendPitchLimiterRef,
      withScene,
    ]
  );

  useEffect(() => {
    return () => {
      cancelCameraLimiterTravelZoom();
      cancelDeferredCameraLimiterRestore();
    };
  }, [cancelCameraLimiterTravelZoom, cancelDeferredCameraLimiterRestore]);

  return {
    areCameraLimitersDisabled,
    reenableCameraLimiters,
    setCameraLimitersDisabled,
  };
};
