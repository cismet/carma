import { useCallback, useEffect } from "react";
import {
  CESIUM_UP_ROLL_RAD,
  computeCesiumPitchDistanceFromNadir,
  isCesiumPitchNearNadir,
} from "@carma-commons/camera/model";
import { negativePiToPi } from "@carma-commons/math";
import { degToRadNumeric, type Radians } from "@carma-units";

import {
  resolveCameraLimiterOptions,
  type CameraLimiterOptions,
} from "../camera-limiter-options";
import { useCesiumContext } from "./useCesiumContext";
import { useCesiumRuntime } from "./useCesiumRuntime";
const NADIR_THRESHOLD = 0.2;
const DEFAULT_ROLL_THRESHOLD_RAD = degToRadNumeric(5)! as Radians;

type CameraRollSoftLimiterOptions = CameraLimiterOptions & {
  debug?: boolean;
  nadirThreshold?: Radians;
  rollThreshold?: Radians;
};

const useCameraRollSoftLimiter = (
  options: CameraRollSoftLimiterOptions = {}
) => {
  const {
    debug = false,
    nadirThreshold = NADIR_THRESHOLD as Radians,
    rollThreshold = DEFAULT_ROLL_THRESHOLD_RAD,
  } = options;
  const {
    limiter: {
      pitch: { enabled: pitchLimiterEnabled },
    },
  } = resolveCameraLimiterOptions(options);
  const runtime = useCesiumRuntime();
  const { shouldSuspendCameraLimitersRef, initialViewApplied, setIsAnimating } =
    useCesiumContext();

  const onComplete = useCallback(
    () => setIsAnimating(false),
    [setIsAnimating]
  );

  useEffect(() => {
    if (runtime && pitchLimiterEnabled) {
      debug &&
        console.debug(
          "HOOK [2D3D|CESIUM] runtime changed add new Cesium MoveEnd Listener to reset rolled camera"
        );
      const moveEndListener = async () => {
        if (shouldSuspendCameraLimitersRef?.current) return;
        if (!initialViewApplied) return;
        if (runtime.camera.position) {
          const currentPitch = runtime.camera.pitch as Radians;
          const normalizedRoll = negativePiToPi(runtime.camera.roll);
          const rollDeviation = Math.abs(normalizedRoll) <= rollThreshold;

          const isCloseToNadir = isCesiumPitchNearNadir(
            currentPitch,
            nadirThreshold
          );

          debug &&
            console.debug(
              "LISTENER HOOK [2D3D|CESIUM|CAMERA]: nadir",
              isCloseToNadir,
              currentPitch,
              computeCesiumPitchDistanceFromNadir(currentPitch)
            );

          if (!rollDeviation && !isCloseToNadir) {
            debug &&
              console.debug(
                "LISTENER HOOK [2D3D|CESIUM|CAMERA]: flyTo reset roll 2D3D",
                rollDeviation
              );
            const rollDelta = Math.abs(normalizedRoll);
            const duration = Math.min(rollDelta, 1);
            setIsAnimating(true);
            runtime.camera.flyTo({
              destination: runtime.camera.position,
              orientation: {
                heading: runtime.camera.heading,
                pitch: runtime.camera.pitch,
                roll: CESIUM_UP_ROLL_RAD,
              },
              duration,
              complete: onComplete,
              cancel: onComplete,
            });
          }
        }
      };
      runtime.camera.moveEnd.addEventListener(moveEndListener);
      return () => {
        !runtime.isDestroyed() &&
          runtime.camera.moveEnd.removeEventListener(moveEndListener);
      };
    }
  }, [
    runtime,
    pitchLimiterEnabled,
    onComplete,
    setIsAnimating,
    debug,
    nadirThreshold,
    rollThreshold,
    initialViewApplied,
    shouldSuspendCameraLimitersRef,
  ]);
};

export default useCameraRollSoftLimiter;
