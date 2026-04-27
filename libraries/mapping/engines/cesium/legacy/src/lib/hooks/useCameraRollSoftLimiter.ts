import { useCallback, useEffect } from "react";
import { useDispatch } from "react-redux";
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
import { clearIsAnimating, setIsAnimating } from "../slices/cesium";
import { useCesiumContext } from "./useCesiumContext";
import { useCesiumViewer } from "./useCesiumViewer";
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
  const viewer = useCesiumViewer();
  const dispatch = useDispatch();
  const { shouldSuspendCameraLimitersRef, initialViewApplied } =
    useCesiumContext();

  const onComplete = useCallback(
    () => dispatch(clearIsAnimating()),
    [dispatch]
  );

  useEffect(() => {
    if (viewer && pitchLimiterEnabled) {
      debug &&
        console.debug(
          "HOOK [2D3D|CESIUM] viewer changed add new Cesium MoveEnd Listener to reset rolled camera"
        );
      const moveEndListener = async () => {
        if (shouldSuspendCameraLimitersRef?.current) return;
        if (!initialViewApplied) return;
        if (viewer.camera.position) {
          const currentPitch = viewer.camera.pitch as Radians;
          const normalizedRoll = negativePiToPi(viewer.camera.roll);
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
            dispatch(setIsAnimating());
            viewer.camera.flyTo({
              destination: viewer.camera.position,
              orientation: {
                heading: viewer.camera.heading,
                pitch: viewer.camera.pitch,
                roll: CESIUM_UP_ROLL_RAD,
              },
              duration,
              complete: onComplete,
              cancel: onComplete,
            });
          }
        }
      };
      viewer.camera.moveEnd.addEventListener(moveEndListener);
      return () => {
        !viewer.isDestroyed() &&
          viewer.camera.moveEnd.removeEventListener(moveEndListener);
      };
    }
  }, [
    viewer,
    pitchLimiterEnabled,
    onComplete,
    dispatch,
    debug,
    nadirThreshold,
    rollThreshold,
    initialViewApplied,
    shouldSuspendCameraLimitersRef,
  ]);
};

export default useCameraRollSoftLimiter;
